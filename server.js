// server.js — DevVoice Backend (Vapi + Groq + Qdrant)

require("dotenv").config();

console.log("GROQ:", process.env.GROQ_API_KEY ? "Loaded" : "Missing");
console.log("VAPI KEY:", process.env.VAPI_PUBLIC_KEY);
console.log("ASSISTANT ID:", process.env.VAPI_ASSISTANT_ID);

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const { embed, embedBatch } = require("./src/embeddings");
const {
  search,
  ensureCollection,
  getStats,
  upsertPoints,
} = require("./src/qdrant");

const { askGroq } = require("./src/ai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));


// =====================================================
// Upload Setup
// =====================================================
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});


// =====================================================
// Conversation Memory
// =====================================================
const conversations = new Map();

function getHistory(sessionId) {
  return conversations.get(sessionId) || [];
}

function addToHistory(sessionId, role, content) {
  const history = getHistory(sessionId);

  history.push({ role, content });

  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }

  conversations.set(sessionId, history);
}


// =====================================================
// Health / Stats
// =====================================================
app.get("/api/health", async (req, res) => {
  try {
    const stats = await getStats();

    res.json({
      status: "ok",
      version: "1.0.0",
      qdrant: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// =====================================================
// Frontend Vapi Config
// =====================================================
app.get("/api/vapi-config", (req, res) => {
  res.json({
    publicKey: process.env.VAPI_PUBLIC_KEY || "",
    assistantId: process.env.VAPI_ASSISTANT_ID || "",
    webhookUrl: `${
      process.env.PUBLIC_URL || "https://your-ngrok-url.ngrok-free.app"
    }/vapi-webhook`,
  });
});


// =====================================================
// Text Chat API
// =====================================================
app.post("/api/chat", async (req, res) => {
  const { message, sessionId = "default" } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({
      error: "Message is required",
    });
  }

  try {
    const vector = await embed(message);
    const results = await search(vector, 4);

    const history = getHistory(sessionId);

    const answer = await askGroq(
      message,
      results,
      history
    );

    addToHistory(sessionId, "user", message);
    addToHistory(sessionId, "assistant", answer);

    res.json({
      answer,
      context: results.map((r) => ({
        file: r.payload?.file,
        score: r.score,
        snippet:
          (r.payload?.text || "").slice(0, 120) + "...",
      })),
      sessionId,
    });
  } catch (err) {
    console.error("Chat error:", err.message);

    res.status(500).json({
      error: err.message,
    });
  }
});


// =====================================================
// Vapi Webhook
// =====================================================
app.post("/vapi-webhook", async (req, res) => {
  const body = req.body;

  console.log("\n📞 Vapi webhook received");
  console.log("Type:", body?.message?.type);

  try {
    const msgType = body?.message?.type;

    if (msgType === "assistant-request") {
      const messages =
        body?.message?.artifact?.messagesOpenAIFormatted || [];

      const lastUser = [...messages]
        .reverse()
        .find((m) => m.role === "user");

      const userText =
        lastUser?.content ||
        body?.message?.transcript ||
        "";

      console.log("🎤 User said:", userText);

      if (!userText) {
        return res.json({
          messageResponse: {
            message:
              "I didn't catch that, could you say it again?",
            endCallAfterSpoken: false,
          },
        });
      }

      const sessionId =
        body?.message?.call?.id || "vapi-default";

      const vector = await embed(userText);
      const results = await search(vector, 3);

      const history = getHistory(sessionId);

      const answer = await askGroq(
        userText,
        results,
        history
      );

      addToHistory(sessionId, "user", userText);
      addToHistory(sessionId, "assistant", answer);

      console.log("🤖 Answer:", answer);

      return res.json({
        messageResponse: {
          message: answer,
          endCallAfterSpoken: false,
        },
      });
    }

    if (msgType === "end-of-call-report") {
      console.log("📴 Call ended");
      return res.json({ received: true });
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("Vapi webhook error:", err.message);

    return res.json({
      messageResponse: {
        message:
          "Sorry, something went wrong. Please try again.",
        endCallAfterSpoken: false,
      },
    });
  }
});


// =====================================================
// Upload & Index Files
// =====================================================
app.post(
  "/api/index-file",
  upload.array("files", 20),
  async (req, res) => {
    if (!req.files?.length) {
      return res.status(400).json({
        error: "No files uploaded",
      });
    }

    const results = [];
    let totalChunks = 0;
    let pointId = Date.now();

    for (const file of req.files) {
      try {
        const content = fs.readFileSync(
          file.path,
          "utf8"
        );

        const chunks = chunkText(
          content,
          file.originalname
        );

        const texts = chunks.map(
          (c) => `File: ${c.file}\n\n${c.text}`
        );

        const vectors = await embedBatch(texts);

        const points = chunks.map((chunk, idx) => ({
          id: pointId++,
          vector: vectors[idx],
          payload: {
            text: chunk.text,
            file: chunk.file,
            indexed_at: new Date().toISOString(),
          },
        }));

        await upsertPoints(points);

        totalChunks += chunks.length;

        results.push({
          file: file.originalname,
          chunks: chunks.length,
          status: "ok",
        });

        fs.unlinkSync(file.path);
      } catch (err) {
        results.push({
          file: file.originalname,
          status: "error",
          error: err.message,
        });
      }
    }

    res.json({
      message: `Indexed ${totalChunks} chunks`,
      results,
      total_chunks: totalChunks,
    });
  }
);


// =====================================================
// Helpers
// =====================================================
function chunkText(text, fileName, size = 600) {
  const chunks = [];

  for (let i = 0; i < text.length; i += size - 100) {
    const t = text.slice(i, i + size).trim();

    if (t.length > 20) {
      chunks.push({
        text: t,
        file: fileName,
      });
    }
  }

  return chunks;
}


// =====================================================
// Frontend Route
// =====================================================
app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});


// =====================================================
// Start Server
// =====================================================
async function start() {
  await ensureCollection();

  app.listen(PORT, () => {
    console.log("\n🎙️ DevVoice Server Running");
    console.log("================================");
    console.log(`Frontend : http://localhost:${PORT}`);
    console.log(
      `Webhook  : http://localhost:${PORT}/vapi-webhook`
    );
    console.log(
      `Chat API : http://localhost:${PORT}/api/chat`
    );
    console.log("================================");
  });
}

start().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});