import asyncio
import logging
import numpy as np
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

class AudioTranscriber:
    def __init__(self, model_size="tiny", device="cpu", compute_type="int8"):
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
        logger.info(f"Loaded Whisper model: {model_size} on {device}")

    async def transcribe_chunk(self, audio_data: bytes, sample_rate=16000):
        """
        Transcribe a chunk of raw audio bytes (16-bit PCM).
        This is a naïve implementation that assumes the chunk is a distinct phrase or 
        relies on Whisper's internal VAD if we feed larger buffers.
        
        For true streaming, we'd need to buffer audio and use a VAD to trigger transcription
        on silence, or use a specific streaming library.
        
        For this MVP, we'll try to process chunks as they come if they are large enough, 
        or accumulate them.
        """
        # Convert bytes to float32 numpy array
        # Assuming 16-bit PCM
        audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0

        # Run transcription in a separate thread to avoid blocking the asyncio loop
        segments, info = await asyncio.to_thread(
            self.model.transcribe, 
            audio_np, 
            beam_size=5,
            language="en",
            vad_filter=True, # Use Whisper's internal VAD
            vad_parameters=dict(min_silence_duration_ms=500)
        )

        results = []
        for segment in segments:
            results.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
                "confidence": segment.avg_logprob
            })
        
        return results
