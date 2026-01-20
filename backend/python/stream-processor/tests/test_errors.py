import pytest
import asyncio
import json
from unittest.mock import MagicMock, patch, AsyncMock
from proto import stream_processor_pb2
from main import CaptioningService

# We test the service class directly to easier inject specific failures
@pytest.fixture
def service_with_mocks():
    with patch("main.AudioTranscriber") as MockTranscriber, \
         patch("main.redis.Redis") as MockRedis:
        
        service = CaptioningService()
        
        # Mock transcriber
        service.transcriber.transcribe_chunk = AsyncMock(return_value=[{"text": "Error Proof", "confidence": 1.0}])
        
        # Mock decode to passthrough
        service.decode_chunk = MagicMock(side_effect=lambda s, d: d)
        
        # Mock cleanup to avoid errors
        service.cleanup_session = MagicMock()
        
        return service

@pytest.mark.asyncio
async def test_redis_failure_graceful(service_with_mocks):
    """
    If Redis fails, the stream should still return captions to the client.
    """
    # Configure Redis to raise exception
    service_with_mocks.redis_client.rpush.side_effect = Exception("Redis connection lost")
    
    session_id = "error_room:user1"
    chunk_data = b'\x00' * 100000 # Trigger threshold
    
    async def iterator():
        yield stream_processor_pb2.AudioChunk(session_id=session_id, audio_data=chunk_data)

    responses = []
    # This should NOT raise an exception
    async for res in service_with_mocks.StreamAudio(iterator(), None):
        responses.append(res)
        
    assert len(responses) == 1
    assert responses[0].text == "Error Proof"
    # Verify Redis attempt was made
    service_with_mocks.redis_client.rpush.assert_called()

@pytest.mark.asyncio
async def test_invalid_audio_data(service_with_mocks):
    """
    If decoding fails (returns None/empty), we should just skip appending and continue.
    """
    # Mock decoder to fail (return None or raise exception caught inside)
    # The actual implementation:
    # try: ... except: return b""
    # So if we mock decode_chunk to return b"", it simulates failure.
    service_with_mocks.decode_chunk.side_effect = lambda s, d: b""
    
    session_id = "bad_audio:user1"
    chunk_data = b'\x00' * 100000 
    
    async def iterator():
        yield stream_processor_pb2.AudioChunk(session_id=session_id, audio_data=chunk_data)
        
    responses = []
    async for res in service_with_mocks.StreamAudio(iterator(), None):
        responses.append(res)
        
    # Since data was invalid (decoded to empty), buffer never fills.
    # No transcription happens.
    assert len(responses) == 0
    # Buffer should be empty
    assert len(service_with_mocks.audio_buffers.get(session_id, [])) == 0
