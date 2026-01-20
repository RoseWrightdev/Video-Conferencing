import pytest
import asyncio
from unittest.mock import MagicMock, patch, AsyncMock
from proto import stream_processor_pb2
from main import CaptioningService

@pytest.fixture
def service_mock_transcriber():
    with patch("main.AudioTranscriber") as MockTranscriber, \
         patch("main.redis.Redis") as MockRedis:
        
        service = CaptioningService()
        service.transcriber.transcribe_chunk = AsyncMock(return_value=[])
        service.decode_chunk = MagicMock(side_effect=lambda s, d: d)
        service.cleanup_session = MagicMock()
        return service

@pytest.mark.asyncio
async def test_target_language_propagation(service_mock_transcriber):
    """
    Verify that target_language param in AudioChunk is passed to transcribe_chunk.
    """
    session_id = "lang_room:user1"
    chunk_data = b'\x00' * 100000 # Trigger threshold
    target_lang = "fr"
    
    async def iterator():
        yield stream_processor_pb2.AudioChunk(
            session_id=session_id, 
            audio_data=chunk_data,
            target_language=target_lang
        )

    async for _ in service_mock_transcriber.StreamAudio(iterator(), None):
        pass
        
    # Verify call
    service_mock_transcriber.transcriber.transcribe_chunk.assert_called_once()
    args, kwargs = service_mock_transcriber.transcriber.transcribe_chunk.call_args
    
    # Check if target_language was passed in kwargs
    assert kwargs.get('target_language') == "fr"
