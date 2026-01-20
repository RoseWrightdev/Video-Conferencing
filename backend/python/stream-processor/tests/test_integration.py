import pytest
import os
import wave
from transcriber import AudioTranscriber

# Path to the downloaded test file
AUDIO_FILE = os.path.join(os.path.dirname(__file__), "jfk.wav")

@pytest.fixture
def real_transcriber():
    # Use 'tiny' model for speed in tests
    return AudioTranscriber(model_size="tiny", device="cpu")

def get_pcm_data(filename):
    with wave.open(filename, 'rb') as wf:
        # Verify format (should be mono 16kHz for best results, but we take what we get)
        # jfk.wav is usually 16kHz mono.
        frames = wf.readframes(wf.getnframes())
        return frames

@pytest.mark.asyncio
async def test_integration_transcribe_jfk(real_transcriber):
    if not os.path.exists(AUDIO_FILE):
        pytest.skip(f"Audio file {AUDIO_FILE} not found")
        
    pcm_data = get_pcm_data(AUDIO_FILE)
    
    # Taking only the first 3 seconds to save time/memory if needed, 
    # but let's do whole clip (11s) as it's short.
    # 3 seconds * 16000 * 2 bytes = 96000 bytes
    # pcm_data = pcm_data[:96000] 
    
    results = await real_transcriber.transcribe_chunk(pcm_data)
    
    # Combine text
    full_text = " ".join([r["text"] for r in results])
    
    # Known transcript snippet
    expected_snippet = "Ask not what your country can do for you"
    
    print(f"Transcript: {full_text}")
    
    # Assert case-insensitive overlap
    assert expected_snippet.lower() in full_text.lower() or "fellow americans" in full_text.lower()
