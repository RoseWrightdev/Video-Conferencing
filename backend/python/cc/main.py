import asyncio
import logging
import grpc
from concurrent import futures
from fastapi import FastAPI
import uvicorn
import cc_pb2
import cc_pb2_grpc
from transcriber import AudioTranscriber

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("cc-service")

# --- FastAPI Setup ---
app = FastAPI(title="Real-Time Captioning Service")

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "cc-service"}

# --- gRPC Setup ---
class CaptioningService(cc_pb2_grpc.CaptioningServiceServicer):
    def __init__(self):
        self.transcriber = AudioTranscriber(model_size="tiny.en", device="cpu", compute_type="int8")
        logger.info("CaptioningService initialized")

    async def StreamAudio(self, request_iterator, context):
        session_id = "unknown"
        try:
            async for chunk in request_iterator:
                if not chunk.audio_data:
                    continue
                session_id = chunk.session_id
                results = await self.transcriber.transcribe_chunk(chunk.audio_data)

                for res in results:
                    if res['text']:
                        logger.info(f"[{session_id}] {res['text']}")
                        yield cc_pb2.CaptionEvent(
                            session_id=session_id,
                            text=res['text'],
                            is_final=True,
                            confidence=res['confidence']
                        )
        except Exception as e:
            logger.error(f"Error in StreamAudio for session {session_id}: {e}")

async def serve_grpc():
    server = grpc.aio.server(futures.ThreadPoolExecutor(max_workers=10))
    cc_pb2_grpc.add_CaptioningServiceServicer_to_server(CaptioningService(), server)
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
