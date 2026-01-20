import av
import pytest
import pytest_asyncio
import asyncio
import grpc
import os
import wave
import json
from unittest.mock import MagicMock, patch
from proto import stream_processor_pb2, stream_processor_pb2_grpc
from main import serve_grpc

# Path to the test audio file
AUDIO_FILE = os.path.join(os.path.dirname(__file__), "jfk.wav")

@pytest.fixture
def mock_redis():
    with patch("main.redis.Redis") as MockRedis, \
         patch("main.os.getenv") as mock_getenv:
        
        # Configure getenv to allow GRPC_PORT passthrough while mocking REDIS envs if needed
        def side_effect(key, default=None):
            if key == "GRPC_PORT":
                return os.environ.get("GRPC_PORT", default)
            return default
            
        mock_getenv.side_effect = side_effect
        
        mock_instance = MockRedis.return_value
        yield mock_instance

@pytest_asyncio.fixture
async def grpc_server(mock_redis):
    # Set a distinct port for testing
    test_port = "50052"
    os.environ["GRPC_PORT"] = test_port
    
    # Start server in background
    task = asyncio.create_task(serve_grpc())
    
    # Give it a moment to start
    await asyncio.sleep(0.5)
    
    yield f"localhost:{test_port}"
    
    # Teardown (cancel task)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

def get_audio_chunks(filename, chunk_size=32000, session_id="test_room:test_user"):
    # Initialize Opus encoder
    # SFU sends 48kHz stereo or mono? Usually 48kHz.
    # We will simulate 48kHz Opus from our 16kHz WAV.
    # PyAV handles resampling automatically if we configure the output codec correctly.
    
    # Open WAV
    container = av.open(filename)
    stream = container.streams.audio[0]
    
    # Create Opus Encoder using a dummy container
    # 'null' format behaves like /dev/null
    output_container = av.open('null', 'w', format='null')
    # Configure via add_stream arguments
    # Opus supports 48kHz, mono/stereo (1 or 2 channels), and usually flt/fltp format
    output_stream = output_container.add_stream('opus', rate=48000, layout='mono', format='fltp')
    
    # Set up resampler from source to 48kHz
    # Opus uses 'fltp' (float planar) usually.
    resampler = av.AudioResampler(
        format='fltp',
        layout='mono',
        rate=48000,
    )

    for frame in container.decode(stream):
        # Resample to 48kHz fltp
        resampled_frames = resampler.resample(frame)
        for r_frame in resampled_frames:
            # Encode
            packets = output_stream.encode(r_frame)
            for packet in packets:
                yield stream_processor_pb2.AudioChunk(
                    session_id=session_id,
                    audio_data=bytes(packet)
                )
    
    # Flush encoder
    packets = output_stream.encode(None)
    for packet in packets:
        yield stream_processor_pb2.AudioChunk(
            session_id=session_id,
            audio_data=bytes(packet)
        )

@pytest.mark.asyncio
async def test_e2e_audio_stream(grpc_server, mock_redis):
    if not os.path.exists(AUDIO_FILE):
        pytest.skip(f"Audio file {AUDIO_FILE} not found")

    async with grpc.aio.insecure_channel(grpc_server) as channel:
        stub = stream_processor_pb2_grpc.CaptioningServiceStub(channel)
        
        # Prepare iterator
        # 16000 samples ~ 0.5s of audio per chunk if 32kHz, or 1s if 16kHz. 
        # file is 16kHz mono.
        # We need to send enough data to trigger BUFFER_THRESHOLD (96000 bytes)
        # 96000 bytes / 2 bytes/frame = 48000 frames = 3 seconds.
        # jfk.wav is ~11s.
        
        session_id = "e2e_room:e2e_user"
        
        # Pre-calculate chunks to avoid blocking the event loop during the gRPC call
        # (Opus encoding in get_audio_chunks is synchronous and CPU bound)
        print("Pre-encoding audio chunks...")
        request_chunks = list(get_audio_chunks(AUDIO_FILE, session_id=session_id))
        print(f"Encoded {len(request_chunks)} chunks.")

        responses = []
        async for response in stub.StreamAudio(iter(request_chunks)):
            responses.append(response)
            
        # Verification
        assert len(responses) > 0
        
        # Check integrity of first response
        first_caption = responses[0]
        assert first_caption.session_id == session_id
        assert len(first_caption.text) > 0
        
        # Check Redis side effect
        # We expect rpush to be called for each caption
        assert mock_redis.rpush.called
        
        # Inspect one of the calls
        args, _ = mock_redis.rpush.call_args
        key = args[0]
        val = args[1]
        
        assert key == "transcript:e2e_room"
        data = json.loads(val)
        assert data["user_id"] == "e2e_user"
        assert "text" in data
        assert "timestamp" in data
        
        # Verify text content roughly matches known transcript
        full_text = " ".join([r.text for r in responses])
        print(f"Full Transcript: {full_text}")
        # 'tiny' model might mistranscribe "ask not" as "as not", so we check for "fellow americans"
        assert "fellow americans" in full_text.lower()
