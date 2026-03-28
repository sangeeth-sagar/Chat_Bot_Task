import { useState, useEffect, useRef, useCallback } from "react";
import { newSession, sendMessage, clearSession } from "./api.js";

// ─── tiny ID helper ───────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);

// ─── Markdown-lite renderer ───────────────────────────────────────────────────
function inlineFormat(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/_(.*?)_/g, "<em>$1</em>");
}

function renderContent(text) {
  const lines = text.split("\n");
  const out = [];
  let listBuf = [], listType = null;

  const flush = (key) => {
    if (!listBuf.length) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    out.push(
      <Tag key={`l${key}`} className={`ml ${listType}`}>
        {listBuf.map((t, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(t) }} />
        ))}
      </Tag>
    );
    listBuf = []; listType = null;
  };

  lines.forEach((line, i) => {
    const ol = line.match(/^\d+\.\s+(.*)/);
    const ul = line.match(/^[-*]\s+(.*)/);
    if (ol) { if (listType !== "ol") { flush(i); listType = "ol"; } listBuf.push(ol[1]); }
    else if (ul) { if (listType !== "ul") { flush(i); listType = "ul"; } listBuf.push(ul[1]); }
    else {
      flush(i);
      out.push(line.trim() === ""
        ? <br key={`b${i}`} />
        : <p key={`p${i}`} dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
      );
    }
  });
  flush("end");
  return out;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="dots">
      <span /><span /><span />
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`msg msg-${isUser ? "u" : "b"}`}>
      <div className="avatar">{isUser ? "You" : "AI"}</div>
      <div className="bubble">
        {isUser
          ? <p>{msg.content}</p>
          : <div className="body">{renderContent(msg.content)}</div>}
        <time>{msg.time}</time>
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  "Tell me about Python",
  "Explain how the internet works",
  "What is machine learning?",
  "Difference between SQL and NoSQL",
];

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [sessionId, setSessionId]   = useState(null);
  const [messages,  setMessages]    = useState([]);
  const [input,     setInput]       = useState("");
  const [loading,   setLoading]     = useState(false);
  const [error,     setError]       = useState(null);
  const [turns,     setTurns]       = useState(0);
  const [status,    setStatus]      = useState("connecting"); // connecting | ok | error
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const textareaRef = useRef(null);

  const scrollDown = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollDown, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [input]);

  const startSession = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    try {
      const data = await newSession();
      setSessionId(data.session_id);
      setMessages([]);
      setTurns(0);
      setStatus("ok");
    } catch {
      setStatus("error");
      setError("Cannot reach the backend. Check that Railway is running and VITE_API_URL is set.");
    }
  }, []);

  useEffect(() => { startSession(); }, [startSession]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading || !sessionId) return;

    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages(prev => [...prev, { id: uid(), role: "user", content: text, time: now }]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const data = await sendMessage(sessionId, text);
      setTurns(Math.floor(data.history_length / 2));
      setMessages(prev => [...prev, {
        id: uid(), role: "bot", content: data.reply,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleNewChat = async () => {
    if (sessionId) await clearSession(sessionId).catch(() => {});
    startSession();
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="shell">

        {/* ── Header ── */}
        <header className="hdr">
          <div className="brand">
            <Logo />
            <span className="brand-name">AI ChatBot</span>
            <span className={`dot dot-${status}`} title={status} />
          </div>
          <div className="meta">
            {sessionId && (
              <span className="badge mono" title={`Session: ${sessionId}`}>
                {sessionId.slice(0, 8)}…
              </span>
            )}
            {turns > 0 && <span className="badge accent">{turns} turns</span>}
            <button className="btn-outline" onClick={handleNewChat}>↺ New Chat</button>
          </div>
        </header>

        {/* ── Messages ── */}
        <main className="feed">
          {messages.length === 0 && !loading && (
            <div className="empty">
              <div className="empty-icon"><Logo size={48} /></div>
              <h2>Context-Aware Chat</h2>
              <p>Ask anything — follow-ups work naturally.<br/>The bot remembers the full conversation.</p>
              <div className="chips">
                {SUGGESTIONS.map(s => (
                  <button key={s} className="chip" onClick={() => setInput(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map(m => <Message key={m.id} msg={m} />)}

          {loading && (
            <div className="msg msg-b">
              <div className="avatar">AI</div>
              <div className="bubble typing-bubble"><TypingDots /></div>
            </div>
          )}

          {error && <div className="err-bar">⚠ {error}</div>}
          <div ref={bottomRef} />
        </main>

        {/* ── Input ── */}
        <footer className="bar">
          <textarea
            ref={el => { textareaRef.current = el; inputRef.current = el; }}
            className="inp"
            placeholder="Message… (Enter to send · Shift+Enter for newline)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            disabled={loading || !sessionId}
          />
          <button className="send" onClick={send} disabled={loading || !input.trim() || !sessionId}>
            <SendIcon />
          </button>
        </footer>

      </div>
    </>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="15" stroke="#4ade80" strokeWidth="1.5" />
      <path d="M9 16a7 7 0 0 1 14 0" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="16" r="3" fill="#4ade80" />
      <path d="M16 19v4" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M1.5 9L16.5 1.5L9 16.5L8 10L1.5 9Z" fill="currentColor" />
    </svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Fira+Code:wght@400;500&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:       #080b10;
  --s1:       #0f1318;
  --s2:       #161b24;
  --s3:       #1d2535;
  --bdr:      #252d3d;
  --acc:      #4ade80;
  --acc2:     #38bdf8;
  --text:     #dde3ee;
  --muted:    #566278;
  --u-bg:     #0c2340;
  --u-bdr:    #1d4ed8;
  --err:      #f87171;
  --r:        16px;
  --sans:     'Instrument Sans', sans-serif;
  --mono:     'Fira Code', monospace;
}

html,body,#root{height:100%}
body{
  background:var(--bg);
  color:var(--text);
  font-family:var(--sans);
  font-size:15px;
  line-height:1.65;
  -webkit-font-smoothing:antialiased;
}

/* Shell */
.shell{
  display:flex;flex-direction:column;
  height:100dvh;
  max-width:840px;margin:0 auto;
}

/* Header */
.hdr{
  display:flex;align-items:center;justify-content:space-between;
  padding:13px 20px;
  background:var(--s1);
  border-bottom:1px solid var(--bdr);
  flex-shrink:0;
}
.brand{display:flex;align-items:center;gap:10px}
.brand-name{font-size:16px;font-weight:600;letter-spacing:-.3px;color:var(--acc)}
.dot{width:8px;height:8px;border-radius:50%}
.dot-connecting{background:#f59e0b;animation:pulse 1.2s infinite}
.dot-ok{background:var(--acc)}
.dot-error{background:var(--err)}

.meta{display:flex;align-items:center;gap:8px}
.badge{
  font-family:var(--mono);font-size:11px;
  padding:3px 9px;border-radius:999px;
  background:var(--s2);border:1px solid var(--bdr);
  color:var(--muted);
}
.badge.accent{color:var(--acc2);border-color:var(--acc2)}
.btn-outline{
  background:transparent;border:1px solid var(--bdr);
  color:var(--muted);padding:5px 13px;border-radius:9px;
  font-family:var(--sans);font-size:12px;cursor:pointer;
  transition:all .15s;
}
.btn-outline:hover{border-color:var(--acc);color:var(--acc)}

/* Feed */
.feed{
  flex:1;overflow-y:auto;
  padding:28px 20px;
  display:flex;flex-direction:column;gap:20px;
  scrollbar-width:thin;scrollbar-color:var(--bdr) transparent;
}

/* Empty state */
.empty{
  margin:auto;text-align:center;
  display:flex;flex-direction:column;align-items:center;gap:12px;
  animation:fadeUp .4s ease both;
}
.empty-icon{opacity:.8}
.empty h2{font-size:22px;font-weight:600;letter-spacing:-.4px}
.empty p{color:var(--muted);font-size:14px;line-height:1.7;max-width:360px}
.chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:4px}
.chip{
  background:var(--s2);border:1px solid var(--bdr);
  color:var(--muted);padding:7px 15px;
  border-radius:999px;font-size:13px;
  font-family:var(--sans);cursor:pointer;transition:all .15s;
}
.chip:hover{border-color:var(--acc);color:var(--acc)}

/* Messages */
.msg{display:flex;gap:12px;animation:fadeUp .22s ease both;max-width:100%}
.msg-u{flex-direction:row-reverse}

.avatar{
  flex-shrink:0;width:36px;height:36px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:10px;font-weight:600;letter-spacing:.5px;font-family:var(--mono);
}
.msg-u .avatar{background:var(--u-bg);color:#93c5fd;border:1px solid var(--u-bdr)}
.msg-b .avatar{background:#0d2b1a;color:var(--acc);border:1px solid var(--acc)}

.bubble{
  background:var(--s2);border:1px solid var(--bdr);
  padding:12px 16px;max-width:min(640px,86%);position:relative;
}
.msg-u .bubble{
  background:var(--u-bg);border-color:var(--u-bdr);
  border-radius:var(--r) var(--r) 4px var(--r);
}
.msg-b .bubble{border-radius:var(--r) var(--r) var(--r) 4px}
.typing-bubble{padding:14px 20px}

.bubble time{
  display:block;font-size:10px;color:var(--muted);
  margin-top:7px;text-align:right;font-family:var(--mono);
}

/* Bot message content */
.body p{margin-bottom:5px}
.body p:last-child{margin-bottom:0}
.body strong{color:var(--acc);font-weight:600}
.body em{color:var(--acc2)}
.body code{
  background:#090d12;border:1px solid var(--bdr);
  border-radius:5px;padding:1px 6px;
  font-family:var(--mono);font-size:13px;color:#f9a8d4;
}
.ml{padding-left:18px;margin:6px 0}
.ml li{margin-bottom:3px}
ul.ml{list-style:"→ "}

/* Typing dots */
.dots{display:flex;gap:5px;align-items:center}
.dots span{
  width:7px;height:7px;border-radius:50%;
  background:var(--acc);opacity:.35;
  animation:bounce 1.1s infinite;
}
.dots span:nth-child(2){animation-delay:.18s}
.dots span:nth-child(3){animation-delay:.36s}

/* Error */
.err-bar{
  background:#1e0b0b;border:1px solid var(--err);
  color:var(--err);border-radius:10px;
  padding:10px 16px;font-size:13px;text-align:center;
}

/* Input bar */
.bar{
  display:flex;align-items:flex-end;gap:10px;
  padding:14px 20px;
  border-top:1px solid var(--bdr);
  background:var(--s1);flex-shrink:0;
}
.inp{
  flex:1;
  background:var(--s2);border:1px solid var(--bdr);
  border-radius:13px;padding:12px 16px;
  color:var(--text);font-family:var(--sans);font-size:15px;
  line-height:1.5;resize:none;outline:none;
  transition:border-color .15s;min-height:46px;max-height:140px;
  overflow-y:auto;
}
.inp::placeholder{color:var(--muted)}
.inp:focus{border-color:var(--acc)}
.inp:disabled{opacity:.45;cursor:not-allowed}

.send{
  width:46px;height:46px;border-radius:13px;
  background:var(--acc);border:none;color:#050a05;
  cursor:pointer;display:flex;align-items:center;justify-content:center;
  flex-shrink:0;transition:all .15s;font-size:16px;
}
.send:hover:not(:disabled){background:#86efac;transform:scale(1.05)}
.send:disabled{opacity:.35;cursor:not-allowed}

/* Animations */
@keyframes fadeUp{
  from{opacity:0;transform:translateY(8px)}
  to{opacity:1;transform:translateY(0)}
}
@keyframes bounce{
  0%,80%,100%{transform:scale(.55);opacity:.35}
  40%{transform:scale(1);opacity:1}
}
@keyframes pulse{
  0%,100%{opacity:1}50%{opacity:.4}
}
`;
