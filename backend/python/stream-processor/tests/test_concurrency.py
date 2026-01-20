import pytest
import pytest_asyncio
import asyncio
import grpc
from unittest.mock import MagicMock, patch, AsyncMock
from proto import stream_processor_pb2, stream_processor_pb2_grpc
from main import serve_grpc, CaptioningService
import os

# Use a mock transcriber to avoid heavy loading multiple models
@pytest.fixture
def mock_transcriber_class():
    with patch("main.AudioTranscriber") as MockClass:
        mock_instance = MockClass.return_value
        # Return a dummy result after a small delay to simulate work
        async def mock_transcribe(*args, **kwargs):
            await asyncio.sleep(0.1)
            return [{"text": "Concurrent Hello", "confidence": 0.9}]
        mock_instance.transcribe_chunk = AsyncMock(side_effect=mock_transcribe)
        yield MockClass

@pytest.fixture
def mock_redis():
    with patch("main.redis.Redis") as MockRedis:
        yield MockRedis

@pytest.fixture
def mock_decoder():
    # Patch the decode_chunk method on the class itself or instances?
    # Since serve_grpc creates a new instance, we should patch the class method or use side_effect on instance if we could capture it.
    # Easiest is to patch the class method source or use mock.patch.object
    with patch("main.CaptioningService.decode_chunk", side_effect=lambda sid, data: data) as mock_decode:
        yield mock_decode

@pytest_asyncio.fixture
async def grpc_server_concurrency(mock_transcriber_class, mock_redis, mock_decoder):
    # Setup unique port
    port = "50053"
    os.environ["GRPC_PORT"] = port
    
    # We need to ensure we mocked the dependencies globally or inject them.
    # main.py instantiates CaptioningService() which instantiates AudioTranscriber().
    # The patch above patches main.AudioTranscriber, so new instances will be mocks.
    
    task = asyncio.create_task(serve_grpc())
    await asyncio.sleep(0.5)
    
    yield f"localhost:{port}"
    
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

@pytest.mark.asyncio
async def test_concurrency_sessions(grpc_server_concurrency):
    """
    Test multiple clients streaming simultaneously.
    """
    num_clients = 5
    
    async def run_client(i):
        async with grpc.aio.insecure_channel(grpc_server_concurrency) as channel:
            stub = stream_processor_pb2_grpc.CaptioningServiceStub(channel)
            session_id = f"room{i}:user{i}"
            
            # Send enough data to trigger threshold (96000 bytes)
            # Send 100k bytes
            chunk_data = b'\x00' * 100000 
            
            def request_iterator():
                yield stream_processor_pb2.AudioChunk(
                    session_id=session_id,
                    audio_data=chunk_data
                )
            
            responses = []
            async for response in stub.StreamAudio(iter([
                stream_processor_pb2.AudioChunk(session_id=session_id, audio_data=chunk_data)
            ])):
                responses.append(response)
            
            return responses

    # Run clients concurrently
    tasks = [run_client(i) for i in range(num_clients)]
    results = await asyncio.gather(*tasks)
    
    # Verify all got results
    for i, res in enumerate(results):
        assert len(res) > 0, f"Client {i} got no response"
        assert res[0].text == "Concurrent Hello"
