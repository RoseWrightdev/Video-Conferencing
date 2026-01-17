import logging
import os
import json
import redis
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from contextlib import asynccontextmanager

import grpc
from concurrent import futures
from proto import summary_service_pb2
from proto import summary_service_pb2_grpc

# --- Configuration ---
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# --- Logging ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("summary-service")

# --- Model Setup ---
from huggingface_hub import hf_hub_download
from llama_cpp import Llama

# Model details
REPO_ID = "bartowski/Llama-3.2-3B-Instruct-GGUF"
FILENAME = "Llama-3.2-3B-Instruct-Q4_K_M.gguf"
MODEL_PATH = f"./models/{FILENAME}"

llm = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global llm, MODEL_PATH
    logger.info(f"Summary Service HTTP (Health) started. Redis at {REDIS_HOST}:{REDIS_PORT}")
    
    # Download Model
    if not os.path.exists("./models"):
        os.makedirs("./models")
    
    if not os.path.exists(MODEL_PATH):
        logger.info(f"Downloading model {FILENAME} from {REPO_ID}...")
        try:
             # Download directly to local path? hf_hub_download handles caching but we want strict path for llama.cpp
             # We can use cache, hf_hub_download returns absolute path to cache.
             # Ideally we copy or symlink, or just use the cache path.
             # Simpler: Use cache path.
             downloaded_path = hf_hub_download(repo_id=REPO_ID, filename=FILENAME)
             logger.info(f"Model downloaded to {downloaded_path}")
             # We will just load from cache path
             MODEL_PATH = downloaded_path
        except Exception as e:
            logger.error(f"Failed to download model: {e}")
            yield
            return
    else:
        # If it exists locally (user manually put it there)
        pass

    # Load Model (Metal support auto-detected usually if compiled right, otherwise CPU)
    try:
        logger.info("Loading Llama model...")
        # n_ctx=2048 or higher for meeting transcripts. 4096 is safe for 3B.
        llm = Llama(model_path=MODEL_PATH, n_ctx=8192, n_threads=6, verbose=True) 
        logger.info("✅ Llama model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load Llama model: {e}")
    
    yield
    
    # Shutdown (cleanup if needed)
    logger.info("Shutting down Summary Service")

# --- App Setup ---
app = FastAPI(title="Meeting Summarization Service", lifespan=lifespan)
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

# --- gRPC Service ---
class SummaryService(summary_service_pb2_grpc.SummaryServiceServicer):
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
                 return summary_service_pb2.SummaryResponse(room_id=room_id, summary="No transcript found.", action_items=[])
            
            transcript_text = ""
            for event_str in raw_events:
                event = json.loads(event_str)
                transcript_text += f"{event.get('user_id', 'Unknown')}: {event.get('text', '')}\n"
                
        except Exception as e:
            logger.error(f"Error fetching from Redis: {e}")
            context.abort(grpc.StatusCode.INTERNAL, f"Redis error: {e}")

        # 2. Call LLM (Mock)
        summary, action_items = mock_llm_summarize(transcript_text)
        
        return summary_service_pb2.SummaryResponse(
            room_id=room_id,
            summary=summary,
            action_items=action_items
        )

def mock_llm_summarize(text: str):
    # Fallback if model not loaded
    if not llm:
        logger.warning("LLM not loaded, using mock fallback")
        word_count = len(text.split())
        return f"Mock Summary ({word_count} words). LLM unavailable.", ["Check logs"]

    # Real Inference
    system_prompt = (
        "You are an expert meeting assistant. "
        "Summarize the following meeting transcript efficiently. "
        "Then list actionable items."
    )
    
    user_message = f"Transcript:\n{text}\n\nPlease provide:\n1. A concise summary.\n2. A list of action items."
    
    try:
        response = llm.create_chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            temperature=0.7,
            max_tokens=1024
        )
        content = response['choices'][0]['message']['content']
        
        # Simple parsing (heuristic)
        # We assume the model follows instructions roughly.
        # Ideally we ask for JSON output for strict parsing, but clear text is fine for now.
        summary = content
        action_items = [] # Parsing specific items from text is hard without structure.
        # Let's just return the whole text as summary for now to be safe, 
        # or try to split if "Action Items:" exists.
        
        parts = content.split("Action Items:")
        if len(parts) > 1:
            summary = parts[0].strip()
            # Split items by newline
            raw_items = parts[1].strip().split('\n')
            action_items = [item.strip('- *') for item in raw_items if item.strip()]
        else:
             # Try "Action items:" casing
            parts = content.split("Action items:")
            if len(parts) > 1:
                summary = parts[0].strip()
                raw_items = parts[1].strip().split('\n')
                action_items = [item.strip('- *') for item in raw_items if item.strip()]
        
        return summary, action_items

    except Exception as e:
        logger.error(f"Inference error: {e}")
        return "Error generating summary.", []

@app.get("/health")
async def health():
    return {"status": "ok"}

async def serve_grpc():
    server = grpc.aio.server(futures.ThreadPoolExecutor(max_workers=10))
    summary_service_pb2_grpc.add_SummaryServiceServicer_to_server(SummaryService(), server)
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
