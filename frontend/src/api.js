// All API calls in one place.
// VITE_API_URL is set via .env locally and Vercel env vars in production.
const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function newSession() {
  const res = await fetch(`${BASE}/session/new`);
  if (!res.ok) throw new Error("Failed to create session");
  return res.json(); // { session_id }
}

export async function sendMessage(sessionId, message) {
  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Server error ${res.status}`);
  }
  return res.json(); // { session_id, reply, history_length }
}

export async function clearSession(sessionId) {
  await fetch(`${BASE}/session/${sessionId}`, { method: "DELETE" });
}

// NEW: fetch full history (useful for page refresh recovery)
export async function getHistory(sessionId) {
  const res = await fetch(`${BASE}/session/${sessionId}/history`);
  if (!res.ok) return null;
  return res.json(); // { history: [{role, content}, ...] }
}

export async function checkHealth() {
  const res = await fetch(`${BASE}/health`);
  return res.ok;
}