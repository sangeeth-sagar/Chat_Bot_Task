"""
Context-Aware Chatbot Backend
FastAPI + OpenAI with in-memory session management and token optimization
Deployed on Railway (persistent server — sessions stay alive)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from openai import OpenAI
from dotenv import load_dotenv
import uuid, os, time

# ─────────────────────────────────────────────
# App Setup
# ─────────────────────────────────────────────
app = FastAPI(title="Context-Aware Chatbot API")

load_dotenv()

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
# { session_id: { "history": [...], "last_active": float } }
# ─────────────────────────────────────────────
sessions: dict[str, dict] = {}

SESSION_TTL_SECONDS = 60 * 60  # 1 hour — stale sessions auto-expire on next request

def _evict_stale_sessions():
    """Remove sessions that haven't been used for SESSION_TTL_SECONDS."""
    now = time.time()
    stale = [sid for sid, data in sessions.items()
             if now - data["last_active"] > SESSION_TTL_SECONDS]
    for sid in stale:
        del sessions[sid]

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
# ─────────────────────────────────────────────
MAX_EXCHANGES = 10  # last 10 user+assistant pairs = 20 messages

def optimize_context(messages: list[dict]) -> list[dict]:
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

    # NEW: reject empty or excessively long messages before hitting the LLM
    @field_validator("message")
    @classmethod
    def message_must_be_valid(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message cannot be empty.")
        if len(v) > 4000:
            raise ValueError("Message too long. Please keep it under 4000 characters.")
        return v

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
    _evict_stale_sessions()
    session_id = str(uuid.uuid4())
    sessions[session_id] = {"history": [], "last_active": time.time()}
    return {"session_id": session_id}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """
    Receive a user message, maintain history, optimize context,
    and return an LLM response.
    """
    session_id = req.session_id

    if session_id not in sessions:
        # Auto-create session if missing (e.g. after a server restart)
        sessions[session_id] = {"history": [], "last_active": time.time()}

    data = sessions[session_id]
    history = data["history"]
    data["last_active"] = time.time()

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
        # Remove the user message we just appended so history stays consistent
        history.pop()
        raise HTTPException(status_code=502, detail=f"LLM API error: {str(e)}")

    assistant_reply = response.choices[0].message.content
    history.append({"role": "assistant", "content": assistant_reply})

    return ChatResponse(
        session_id=session_id,
        reply=assistant_reply,
        history_length=len(history),
    )


# NEW: let the frontend fetch and display full chat history
@app.get("/session/{session_id}/history")
def get_history(session_id: str):
    """Return the full conversation history for a session."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"history": sessions[session_id]["history"]}


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