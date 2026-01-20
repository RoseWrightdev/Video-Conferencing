import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from proto import stream_processor_pb2

# Import the class we want to test. 
# Note: We might need to mock imports in main.py if they have side effects at module level
# but main.py has logic guarded by `if __name__ == "__main__":` so it should be safe.
from main import CaptioningService

@pytest.fixture
def mock_transcriber_class():
    with patch("main.AudioTranscriber") as MockClass:
        yield MockClass

@pytest.fixture
def mock_redis():
    with patch("redis.Redis") as MockRedis:
        yield MockRedis

@pytest.fixture
def service(mock_transcriber_class, mock_redis):
    # Setup the service with mocked dependencies
    service = CaptioningService()
    # Mock the transciber instance method
    service.transcriber.transcribe_chunk = AsyncMock(return_value=[]) 
    
    # Mock decode_chunk to pass through data (since we're sending raw PCM in these tests)
    service.decode_chunk = MagicMock(side_effect=lambda sid, data: data)

    # Mock cleanup_session to prevent buffer deletion during tests
    service.cleanup_session = MagicMock()
    
    return service

@pytest.mark.asyncio
async def test_buffering_accumulation(service):
    """Test that small chunks are buffered and not processed immediately."""
    
    # 1. Create a mock request iterator that yields small chunks
    session_id = "room1:user1"
    
    # 0.1 seconds of audio (3200 bytes at 16kHz 16-bit mono)
    small_chunk_size = 3200
    small_chunk_data = b'\x00' * small_chunk_size
    
    async def request_iterator():
        yield stream_processor_pb2.AudioChunk(
            session_id=session_id,
            audio_data=small_chunk_data
        )
        # Yield another small chunk
        yield stream_processor_pb2.AudioChunk(
            session_id=session_id,
            audio_data=small_chunk_data
        )

    # 2. Run StreamAudio
    # We need to run it, but since it's an infinite loop reader, we mocked the iterator to finish.
    async for response in service.StreamAudio(request_iterator(), None):
        pass

    # 3. Assertions
    # Buffer should have 6400 bytes
    assert len(service.audio_buffers[session_id]) == 6400
    
    # Transcribe should NOT have been called (threshold is 96000)
    service.transcriber.transcribe_chunk.assert_not_called()

@pytest.mark.asyncio
async def test_buffering_threshold_trigger(service):
    """Test that accumulating enough data triggers transcription."""
    
    session_id = "room1:user1"
    
    # Create a chunk strictly larger than threshold (96000)
    # Let's send 100000 bytes
    large_chunk_data = b'\x00' * 100000
    
    # Mock transcriber to return a result so we can see output
    service.transcriber.transcribe_chunk.return_value = [
        {"text": "Hello world", "confidence": 0.9}
    ]

    async def request_iterator():
        yield stream_processor_pb2.AudioChunk(
            session_id=session_id,
            audio_data=large_chunk_data
        )

    responses = []
    async for response in service.StreamAudio(request_iterator(), None):
        responses.append(response)

    # 1. Transcribe should have been called
    service.transcriber.transcribe_chunk.assert_called_once()
    
    # 2. Buffer should be cleared (or mostly cleared depending on implementation, 
    # but current implementation clears ALL after processing)
    assert len(service.audio_buffers[session_id]) == 0
    
    # 3. We should get a response
    assert len(responses) == 1
    assert responses[0].text == "Hello world"
    assert responses[0].session_id == session_id

@pytest.mark.asyncio
async def test_session_isolation(service):
    """Test that buffers are isolated between sessions."""
    
    chunk_data = b'\x00' * 1000
    
    async def request_iterator():
        yield stream_processor_pb2.AudioChunk(session_id="sessionA", audio_data=chunk_data)
        yield stream_processor_pb2.AudioChunk(session_id="sessionB", audio_data=chunk_data)
        # Add more to A
        yield stream_processor_pb2.AudioChunk(session_id="sessionA", audio_data=chunk_data)

    async for _ in service.StreamAudio(request_iterator(), None):
        pass

    assert len(service.audio_buffers["sessionA"]) == 2000
    assert len(service.audio_buffers["sessionB"]) == 1000
