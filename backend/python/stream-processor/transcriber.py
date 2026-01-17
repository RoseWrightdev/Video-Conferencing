import asyncio
import logging
import numpy as np
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

class AudioTranscriber:
    def __init__(self, model_size="tiny", device="cpu", compute_type="int8"):
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
        logger.info(f"Loaded Whisper model: {model_size} on {device}")

    async def transcribe_chunk(self, audio_data: bytes, target_language: str = None, sample_rate=16000):
        """
        Transcribe or translate a chunk of raw audio bytes.
        """
        # Convert bytes to float32 numpy array
        # Assuming 16-bit PCM
        audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0

        # Determine task and language params
        task = "transcribe"
        language = None # Auto-detect if None

        if target_language:
            if target_language.lower() == "en":
                # If target is English, we can use the translate task (Any -> English)
                task = "translate"
            else:
                # For non-English targets, standard Whisper only supports Any->English translation.
                # If the user asks for "es", we assume they mean the SOURCE is "es" and they want transcription.
                # Or we fallback to transcription in that language.
                language = target_language.lower()
        
        # Run transcription in a separate thread
        segments, info = await asyncio.to_thread(
            self.model.transcribe, 
            audio_np, 
            beam_size=5,
            task=task,
            language=language,
            vad_filter=True,
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
