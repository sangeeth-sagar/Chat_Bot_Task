# Context-Aware Chatbot 🤖
> FastAPI backend on Railway · React frontend on Vercel

---

## 📁 Repository Structure

```
chatbot/
├── backend/
│   ├── main.py            ← FastAPI app (unchanged from original)
│   ├── requirements.txt   ← Python dependencies
│   ├── Procfile           ← Tells Railway how to start the server
│   ├── railway.toml       ← Railway config (health check, restart policy)
│   └── .env.example       ← Copy to .env for local dev
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx       ← React entry point
│   │   ├── App.jsx        ← Full chat UI
│   │   └── api.js         ← All API calls (reads VITE_API_URL)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example       ← Copy to .env for local dev
│
└── .gitignore
```

---

## 🖥️ Local Development (Run Both Servers)

### 1. Backend
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create your .env file
cp .env.example .env
# Edit .env and add your OpenAI API key

# Start server
uvicorn main:app --reload --port 8000
```
→ API live at http://localhost:8000
→ Swagger docs at http://localhost:8000/docs

### 2. Frontend (new terminal)
```bash
cd frontend

# Install dependencies
npm install

# Create your .env file
cp .env.example .env
# .env already has VITE_API_URL=http://localhost:8000

# Start dev server
npm run dev
```
→ App live at http://localhost:5173

---

## 🚂 Deploy Backend to Railway

### Step 1 — Push backend to GitHub
```bash
# From the repo root
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/chatbot.git
git push -u origin main
```

### Step 2 — Create Railway project
1. Go to https://railway.app and sign in (GitHub login recommended)
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your repository
4. Railway will detect it's a Python project automatically

### Step 3 — Set the root directory
In Railway project settings:
- **Root Directory** → set to `backend`
- Railway will now only look inside the `backend/` folder

### Step 4 — Add environment variables
In Railway dashboard → your service → **Variables** tab:

| Variable | Value |
|----------|-------|
| `OPENAI_API_KEY` | `sk-your-key-here` |
| `ALLOWED_ORIGINS` | `http://localhost:5173` (update after Vercel deploy) |

### Step 5 — Deploy
Railway auto-deploys on every push. Click **"Deploy"** or just push to GitHub.

After deploy, copy your Railway URL — it looks like:
```
https://chatbot-backend-production-xxxx.up.railway.app
```

✅ Test it: open `https://your-railway-url.up.railway.app/health` — should return `{"status":"ok"}`

---

## ▲ Deploy Frontend to Vercel

### Step 1 — Install Vercel CLI
```bash
npm install -g vercel
```

### Step 2 — Deploy
```bash
cd frontend
vercel
```
Follow the prompts:
- Set up and deploy? **Y**
- Which scope? *(your account)*
- Link to existing project? **N**
- Project name: `chatbot-frontend`
- Directory: `./` (press Enter)
- Override build settings? **N**

### Step 3 — Add the Railway URL as an environment variable
```bash
vercel env add VITE_API_URL
# Enter your Railway URL when prompted:
# https://chatbot-backend-production-xxxx.up.railway.app

# Select environments: Production, Preview, Development (all three)
```

Or do it in the Vercel dashboard:
**Project Settings → Environment Variables → Add**
- Key: `VITE_API_URL`
- Value: `https://your-railway-url.up.railway.app`

### Step 4 — Redeploy to apply the env var
```bash
vercel --prod
```

Copy your Vercel URL — looks like:
```
https://chatbot-frontend.vercel.app
```

---

## 🔗 Final Step — Update CORS on Railway

Now that you have the Vercel frontend URL, go back to Railway:

**Variables tab → update `ALLOWED_ORIGINS`:**
```
https://chatbot-frontend.vercel.app,http://localhost:5173
```

Railway will auto-redeploy. Done! ✅

---

## 🧪 Demo — Context Retention Test

Open your Vercel URL and try this conversation:

```
You:  Tell me about Python
Bot:  [explains Python — language, history, use cases]

You:  What are its advantages?
Bot:  [correctly resolves "its" = Python, lists advantages]

You:  How does it compare to JavaScript?
Bot:  [compares Python vs JavaScript without repeating prior answer]

You:  Which one should I learn first as a beginner?
Bot:  [gives recommendation using full conversation context]

You:  Can you summarise what we discussed?
Bot:  [summarises the whole conversation accurately]
```

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/session/new` | Create a new session, returns `session_id` |
| `POST` | `/chat` | Send message `{session_id, message}` → `{reply, history_length}` |
| `DELETE` | `/session/{id}` | Clear session history |

---

## 💡 Why Railway for Backend?

| | Vercel (Serverless) | Railway (Persistent) |
|--|--|--|
| In-memory sessions | ❌ Resets each request | ✅ Stays alive |
| Python support | ⚠️ Limited | ✅ First-class |
| Cold starts | ~1-3s | ~0s after first boot |
| Free tier | ✅ Generous | ✅ $5 credit/month |
| Config needed | vercel.json required | Zero config |
