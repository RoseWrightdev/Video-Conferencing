import logging
import os
import json
import redis
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

import grpc
from concurrent import futures
import cc_pb2
import cc_pb2_grpc

# --- Configuration ---
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# --- Logging ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("summary-service")

# --- App Setup ---
app = FastAPI(title="Meeting Summarization Service")
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

# --- gRPC Service ---
class SummaryService(cc_pb2_grpc.SummaryServiceServicer):
    async def Summarize(self, request, context):
        room_id = request.room_id
        logger.info(f"Received gRPC summary request for room: {room_id}")
        
        # 1. Fetch transcript from Redis
        try:
            raw_events = redis_client.lrange(f"transcript:{room_id}", 0, -1)
            if not raw_events:
                 # Return empty or error. For gRPC, we can return empty or abort.
                 # Let's return empty response with no summary.
                 logger.warning(f"No transcript found for room {room_id}")
                 return cc_pb2.SummaryResponse(room_id=room_id, summary="No transcript found.", action_items=[])
            
            transcript_text = ""
            for event_str in raw_events:
                event = json.loads(event_str)
                transcript_text += f"{event.get('user_id', 'Unknown')}: {event.get('text', '')}\n"
                
        except Exception as e:
            logger.error(f"Error fetching from Redis: {e}")
            context.abort(grpc.StatusCode.INTERNAL, f"Redis error: {e}")

        # 2. Call LLM (Mock)
        summary, action_items = mock_llm_summarize(transcript_text)
        
        return cc_pb2.SummaryResponse(
            room_id=room_id,
            summary=summary,
            action_items=action_items
        )

def mock_llm_summarize(text: str):
    """
    Mock LLM function. In production, this would call OpenAI API.
    """
    word_count = len(text.split())
    summary = f"Meeting Summary (Mock):\nDiscussions involved {word_count} words. The team discussed key project milestones."
    action_items = [
        "Review the transcript.",
        "Follow up on action items."
    ]
    return summary, action_items

# --- Startup ---
@app.on_event("startup")
async def startup_event():
    logger.info(f"Summary Service HTTP (Health) started. Redis at {REDIS_HOST}:{REDIS_PORT}")

@app.get("/health")
async def health():
    return {"status": "ok"}

async def serve_grpc():
    server = grpc.aio.server(futures.ThreadPoolExecutor(max_workers=10))
    cc_pb2_grpc.add_SummaryServiceServicer_to_server(SummaryService(), server)
    listen_addr = '[::]:50052' # Port 50052 for Summary Service
    server.add_insecure_port(listen_addr)
    logger.info(f"Starting gRPC server on {listen_addr}")
    await server.start()
    await server.wait_for_termination()

async def serve_http():
    config = uvicorn.Config(app, host="0.0.0.0", port=8001, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()

async def main():
    import asyncio
    await asyncio.gather(serve_grpc(), serve_http())

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
