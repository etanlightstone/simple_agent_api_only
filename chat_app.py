"""
Hybrid server: serves the chat UI, a custom REST API (/chat), and the
A2A protocol (/a2a) — all from a single FastAPI process.
"""

import argparse
import os
import logging
import traceback
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

from domino.agents.tracing import add_tracing
from domino.agents.logging import DominoRun

from simplest_agent import agent

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(SCRIPT_DIR, "static")

# Build the A2A sub-app first so we can wire its TaskManager into
# FastAPI's lifespan.  Mounted sub-apps don't get their own lifespan
# triggered by the parent, so we do it explicitly.
a2a_app = agent.to_a2a()


@asynccontextmanager
async def lifespan(app):
    async with a2a_app.task_manager:
        yield


app = FastAPI(
    title="Simple Agent Chat",
    description="Chat interface for the simple agent",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    """Request model for chat messages"""
    message: str
    conversation_id: Optional[str] = None


class ChatResponse(BaseModel):
    """Response model for chat messages"""
    response: str
    conversation_id: str


@add_tracing(name='single_question_agent_api', autolog_frameworks=["pydantic_ai"])
async def ask_agent(question):
    result = await agent.run(question)
    return result


@app.post("/chat")
async def chat(request: ChatMessage) -> ChatResponse:
    """Process a chat message using the simplest_agent."""
    try:
        result = await ask_agent(request.message)
        conv_id = request.conversation_id or str(id(request))
        return ChatResponse(
            response=result.output,
            conversation_id=conv_id
        )
    except Exception as e:
        logger.error(f"Error in /chat endpoint: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "agent": "simplest_agent"}


# A2A protocol — other agents can reach this at /a2a/
# and discover the agent card at /a2a/.well-known/agent-card.json
app.mount("/a2a", a2a_app)

# Serve static files (CSS, JS) — must be after API routes
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def serve_index():
    """Serve the main chat interface"""
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/{path:path}")
async def serve_static_files(path: str):
    """
    Catch-all route to serve static files.
    This allows the app to work when hosted at any base path.
    """
    file_path = os.path.join(STATIC_DIR, path)

    if not os.path.abspath(file_path).startswith(os.path.abspath(STATIC_DIR)):
        raise HTTPException(status_code=403, detail="Forbidden")

    if os.path.isfile(file_path):
        return FileResponse(file_path)

    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the Simple Agent Chat server")
    parser.add_argument(
        "--port", "-p",
        type=int,
        default=int(os.environ.get("PORT", 8000)),
        help="Port to run the server on (default: 8000 or PORT env var)"
    )
    parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Host to bind the server to (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug mode with verbose logging"
    )
    args = parser.parse_args()

    log_level = "debug" if args.debug else "info"

    print(f"Starting chat server on http://localhost:{args.port}")
    print(f"  Chat UI:      http://localhost:{args.port}/")
    print(f"  REST API:     POST http://localhost:{args.port}/chat")
    print(f"  A2A protocol: POST http://localhost:{args.port}/a2a/message/send")
    print(f"  A2A card:     GET  http://localhost:{args.port}/a2a/.well-known/agent-card.json")
    print(f"  Health:       GET  http://localhost:{args.port}/health")
    print(f"Serving static files from: {STATIC_DIR}")
    print(f"Log level: {log_level}")
    uvicorn.run(app, host=args.host, port=args.port, log_level=log_level)
