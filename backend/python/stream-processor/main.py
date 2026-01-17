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

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("cc-service")

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

    async def StreamAudio(self, request_iterator, context):
        session_id = "unknown"
        target_language = None
        try:
            async for chunk in request_iterator:
                if not chunk.audio_data:
                    continue
                session_id = chunk.session_id
                
                # Update target language if provided
                if chunk.target_language:
                    target_language = chunk.target_language

                results = await self.transcriber.transcribe_chunk(chunk.audio_data, target_language=target_language)

                for res in results:
                    if res['text']:
                        logger.info(f"[{session_id}] {res['text']}")
                        # Parse session_id (room_id:user_id)
                        parts = session_id.split(":")
                        room_id = parts[0] if len(parts) > 0 else "unknown"
                        user_id = parts[1] if len(parts) > 1 else "unknown"

                        # Push to Redis for summarization
                        # Format: transcript:{room_id} -> JSON list of events
                        # We use RPUSH to append.
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

async def serve_grpc():
    server = grpc.aio.server(futures.ThreadPoolExecutor(max_workers=10))
    stream_processor_pb2_grpc.add_CaptioningServiceServicer_to_server(CaptioningService(), server)
    listen_addr = '[::]:50051'
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
