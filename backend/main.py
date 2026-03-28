"""
Context-Aware Chatbot Backend
FastAPI + OpenAI with in-memory session management and token optimization
Deployed on Railway (persistent server — sessions stay alive)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
import uuid
import os

# ─────────────────────────────────────────────
# App Setup
# ─────────────────────────────────────────────
app = FastAPI(title="Context-Aware Chatbot API")

load_dotenv()

# Read allowed origins from env (set in Railway dashboard)
# Falls back to localhost for local dev
ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
# ─────────────────────────────────────────────
# In-Memory Session Store
# Works perfectly on Railway (real persistent server)
# { session_id: [{"role": "...", "content": "..."}, ...] }
# ─────────────────────────────────────────────
sessions: dict[str, list[dict]] = {}

# ─────────────────────────────────────────────
# System Prompt (Prompt Engineering)
# ─────────────────────────────────────────────
SYSTEM_PROMPT = """You are a precise, context-aware AI assistant. Follow these rules strictly:

1. CONTEXT RETENTION
   - Always use the full conversation history to understand pronouns, references, and follow-up questions.
   - If the user says "it", "its", "they", "that", or similar, resolve the reference from prior messages before answering.

2. ANTI-HALLUCINATION
   - Only state facts you are confident about.
   - If you are unsure or lack reliable knowledge on a topic, explicitly say so. Do NOT fabricate data, statistics, names, dates, or sources.
   - Prefer saying "I'm not certain, but..." or "You may want to verify this..." over presenting uncertain information as fact.

3. CLARIFICATION PROTOCOL
   - If a user's query is ambiguous, incomplete, or lacks sufficient context, ask ONE clear, specific clarifying question before attempting an answer.
   - Do not guess the user's intent when clarification would lead to a significantly better answer.

4. NON-REPETITION
   - Never repeat an answer you have already given in the current conversation.
   - If a topic was covered, briefly reference it and build upon or extend it rather than restating it.

5. RESPONSE QUALITY
   - Be concise and direct. Avoid unnecessary filler phrases.
   - Structure longer answers with clear formatting (bullet points, numbered steps) when helpful.
   - Match your tone to the user's: technical for technical questions, casual for casual chat.
"""

# ─────────────────────────────────────────────
# Token Optimization Utility
# Keeps the last N exchanges to stay within context limits.
# ─────────────────────────────────────────────
MAX_EXCHANGES = 10  # last 10 user+assistant pairs = 20 messages

def optimize_context(messages: list[dict]) -> list[dict]:
    """
    Truncate conversation history to the most recent MAX_EXCHANGES turns.
    Each 'exchange' = 1 user message + 1 assistant message (2 items).
    The system prompt is never included here — it's prepended at call time.
    """
    max_messages = MAX_EXCHANGES * 2
    if len(messages) > max_messages:
        messages = messages[-max_messages:]
    return messages

# ─────────────────────────────────────────────
# Request / Response Schemas
# ─────────────────────────────────────────────
class ChatRequest(BaseModel):
    session_id: str
    message: str

class ChatResponse(BaseModel):
    session_id: str
    reply: str
    history_length: int

class NewSessionResponse(BaseModel):
    session_id: str

# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@app.get("/session/new", response_model=NewSessionResponse)
def create_session():
    """Generate a new session ID and initialize empty history."""
    session_id = str(uuid.uuid4())
    sessions[session_id] = []
    return {"session_id": session_id}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """
    Receive a user message, maintain history, optimize context,
    and return an LLM response.
    """
    session_id = req.session_id

    if session_id not in sessions:
        sessions[session_id] = []

    history = sessions[session_id]
    history.append({"role": "user", "content": req.message})

    optimized_history = optimize_context(history)

    messages_to_send = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ] + optimized_history

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages_to_send,
            temperature=0.7,
            max_tokens=1024,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM API error: {str(e)}")

    assistant_reply = response.choices[0].message.content
    history.append({"role": "assistant", "content": assistant_reply})

    return ChatResponse(
        session_id=session_id,
        reply=assistant_reply,
        history_length=len(history),
    )


@app.delete("/session/{session_id}")
def clear_session(session_id: str):
    """Clear the conversation history for a given session."""
    if session_id in sessions:
        sessions.pop(session_id)
        return {"status": "cleared", "session_id": session_id}
    raise HTTPException(status_code=404, detail="Session not found")


@app.get("/health")
def health():
    return {"status": "ok", "active_sessions": len(sessions)}
