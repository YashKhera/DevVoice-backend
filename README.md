# 🎙️ DevVoice — Vapi Edition

Voice-native AI coding assistant. Ask questions about your codebase out loud.

**Stack (zero OpenAI/Anthropic costs):**
| Layer | Service | Cost |
|---|---|---|
| 🎤 Voice + LLM | [Vapi](https://vapi.ai) | Your Vapi credits |
| 🔢 Embeddings | [Jina AI](https://jina.ai) | **Free** (1M tokens/month) |
| 🗄️ Vector DB | [Qdrant](https://cloud.qdrant.io) | **Free** (1GB cluster) |

---

## ⚡ Quick Start

### 1. Clone & install
```bash
npm install
cp .env.example .env
```

### 2. Get your free API keys

**Jina AI (embeddings — free):**
- Go to [jina.ai](https://jina.ai) → Sign up → Copy API key
- Paste into `.env` as `JINA_API_KEY`

**Qdrant (vector DB — free):**
- Go to [cloud.qdrant.io](https://cloud.qdrant.io) → Create free cluster
- Copy URL + API key into `.env`

**Vapi:**
- Go to [dashboard.vapi.ai](https://dashboard.vapi.ai)
- Create an assistant → copy `Public Key`, `Private Key`, `Assistant ID`

### 3. Configure your Vapi Assistant

In the Vapi dashboard, set your assistant's model to **Custom LLM** and point it to:
```
https://YOUR-NGROK-URL/vapi-llm
```
This lets Vapi use its own credits for the LLM while DevVoice injects your RAG context.

### 4. Start the server
```bash
npm run dev
```

### 5. Expose with ngrok
```bash
ngrok http 3000
```
Copy the `https://xxx.ngrok.io` URL into:
- Your `.env` as `PUBLIC_URL`
- Your Vapi assistant's **Server URL** and **Custom LLM URL**

### 6. Index your codebase
Upload files via the web UI at `http://localhost:3000`, or use the indexer:
```bash
node scripts/indexer.js
```

---

## 📡 API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check + Qdrant stats |
| POST | `/api/chat` | Text chat with RAG |
| POST | `/vapi-webhook` | Vapi event handler |
| POST | `/vapi-llm` | Custom LLM endpoint (OpenAI-compatible) |
| POST | `/api/index-file` | Upload + index code files |
| GET | `/api/vapi-config` | Frontend config |

---

## ⚠️ Note on Vector Dimensions

Jina AI embeddings are **768-dimensional** (vs OpenAI's 1536).  
If you had a previous Qdrant collection from the OpenAI version, either:
- Change `QDRANT_COLLECTION` to a new name (e.g. `devvoice-v2`), or
- Delete the old collection in the Qdrant dashboard

The server will auto-create the collection with the correct size on first run.
