import asyncio
import logging
import grpc
from concurrent import futures
from fastapi import FastAPI
import uvicorn
from proto import stream_processor_pb2
from proto import stream_processor_pb2_grpc
from transcriber import AudioTranscriber
import os
import json
import time
import redis
import av

# Configure logging
from opentelemetry.instrumentation.logging import LoggingInstrumentor

# Instrument logging to include trace_id
LoggingInstrumentor().instrument(set_logging_format=True)

# Set root logger level to INFO so other modules (transcriber) log info
logging.getLogger().setLevel(logging.INFO)

# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("cc-service")
logger.setLevel(logging.INFO)
# Silence noisy libraries
logging.getLogger("faster_whisper").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

# --- FastAPI Setup ---
app = FastAPI(title="Real-Time Captioning Service")

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "cc-service"}

# --- gRPC Setup ---
class CaptioningService(stream_processor_pb2_grpc.CaptioningServiceServicer):
    def __init__(self):
        # Use 'tiny' (multilingual) instead of 'tiny.en' to support translation/non-English input
        self.transcriber = AudioTranscriber(model_size="tiny", device="cpu", compute_type="int8")
        
        # Initialize Redis
        try:
            # Assume Redis is at localhost:6379 or use env var
            redis_host = os.getenv("REDIS_HOST", "localhost")
            redis_port = int(os.getenv("REDIS_PORT", 6379))
            self.redis_client = redis.Redis(host=redis_host, port=redis_port, db=0)
            logger.info(f"Connected to Redis at {redis_host}:{redis_port}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            self.redis_client = None

        logger.info("CaptioningService initialized")

        # Buffer for accumulating audio chunks per session
        # Format: {session_id: bytearray}
        self.audio_buffers = {}
        
        # Audio Decoders per session
        # Format: {session_id: {"decoder": av.CodecContext, "resampler": av.AudioResampler}}
        self.decoders = {}

    def decode_chunk(self, session_id, packet_bytes):
        """
        Decodes an Opus packet and resamples to 16kHz PCM (s16le).
        """
        # Initialize decoder/resampler if new session
        if session_id not in self.decoders:
            try:
                codec = av.CodecContext.create('opus', 'r')
                resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)
                self.decoders[session_id] = {
                    "codec": codec,
                    "resampler": resampler
                }
                logger.info(f"Initialized Opus decoder/resampler for session {session_id}")
            except Exception as e:
                logger.error(f"Failed to initialize decoder for {session_id}: {e}")
                return b""

        decoder_ctx = self.decoders[session_id]
        codec = decoder_ctx["codec"]
        resampler = decoder_ctx["resampler"]

        out_bytes = bytearray()
        
        try:
            # Create packet
            packet = av.Packet(packet_bytes)
            
            # Decode
            frames = codec.decode(packet)
            
            # Resample and collect
            for frame in frames:
                resampled_frames = resampler.resample(frame)
                for r_frame in resampled_frames:
                    out_bytes.extend(r_frame.to_ndarray().tobytes())
                    
        except Exception as e:
            logger.warning(f"Error decoding chunk for {session_id}: {e}")
            
        return bytes(out_bytes)

    async def StreamAudio(self, request_iterator, context):
        session_id = "unknown"
        target_language = None
        
        # Threshold for processing (e.g., 3.0 seconds of audio at 16kHz 16-bit mono = 96000 bytes)
        # Whisper works best with > 3s of context.
        BUFFER_THRESHOLD = int(os.getenv("BUFFER_THRESHOLD_BYTES", 96000)) 

        try:
            async for chunk in request_iterator:
                # Ensure we have data
                if len(chunk.audio_data) == 0:
                    continue

                session_id = chunk.session_id
                
                # Update target language if provided
                if chunk.target_language:
                    target_language = chunk.target_language

                if session_id not in self.audio_buffers:
                    self.audio_buffers[session_id] = bytearray()
                
                # Decode Opus packet to PCM (offload to thread to avoid blocking event loop)
                pcm_data = await asyncio.to_thread(self.decode_chunk, session_id, chunk.audio_data)
                
                # Append to buffer
                if pcm_data:
                    self.audio_buffers[session_id].extend(pcm_data)

                # Only process if buffer exceeds threshold
                if len(self.audio_buffers[session_id]) >= BUFFER_THRESHOLD:
                    # Drain buffer for processing
                    audio_to_process = bytes(self.audio_buffers[session_id])
                    self.audio_buffers[session_id].clear()

                    results = await self.transcriber.transcribe_chunk(audio_to_process, target_language=target_language)

                    for res in results:
                        if res['text']:
                            logger.info(f"CAPTION [{session_id}]: {res['text']}")
                            # Parse session_id (room_id:user_id)
                            parts = session_id.split(":")
                            room_id = parts[0] if len(parts) > 0 else "unknown"
                            user_id = parts[1] if len(parts) > 1 else "unknown"

                            # Push to Redis for summarization
                            # Format: transcript:{room_id} -> JSON list of events
                            # We use RPUSH to append.
                            try:
                                event_data = {
                                    "user_id": user_id,
                                    "text": res['text'],
                                    "timestamp": time.time(),
                                    "confidence": res['confidence']
                                }
                                # self.redis_client is initialized in __init__
                                if self.redis_client:
                                    self.redis_client.rpush(f"transcript:{room_id}", json.dumps(event_data))
                            except Exception as e:
                                logger.error(f"Redis error: {e}")

                            yield stream_processor_pb2.CaptionEvent(
                                session_id=session_id,
                                text=res['text'],
                                is_final=True,
                                confidence=res['confidence']
                            )
        except Exception as e:
            logger.error(f"Error in StreamAudio for session {session_id}: {e}")
        finally:
            self.cleanup_session(session_id)

    def cleanup_session(self, session_id):
        """Cleanup session resources to prevent memory leaks."""
        if session_id != "unknown":
            logger.info(f"Cleaning up resources for session {session_id}")
            if session_id in self.audio_buffers:
                del self.audio_buffers[session_id]
            if session_id in self.decoders:
                del self.decoders[session_id]

async def serve_grpc():
    server = grpc.aio.server(futures.ThreadPoolExecutor(max_workers=10))
    stream_processor_pb2_grpc.add_CaptioningServiceServicer_to_server(CaptioningService(), server)
    port = os.getenv("GRPC_PORT", "50051")
    listen_addr = f'[::]:{port}'
    server.add_insecure_port(listen_addr)
    logger.info(f"Starting gRPC server on {listen_addr}")
    await server.start()
    await server.wait_for_termination()

async def serve_http():
    config = uvicorn.Config(app, host="0.0.0.0", port=8000, log_level="info")
    server = uvicorn.Server(config)
    logger.info("Starting FastAPI server on http://0.0.0.0:8000")
    await server.serve()

async def main():
    # Run both servers concurrently
    await asyncio.gather(
        serve_grpc(),
        serve_http()
    )

if __name__ == '__main__':
    asyncio.run(main())
