// src/ai.js — Groq direct API (no OpenAI SDK)
require("dotenv").config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

async function askClaude(message, context = [], history = []) {
  try {
    const contextText = context
      .map((r) => r.payload?.text || "")
      .join("\n\n");

    const historyMessages = history.map((h) => ({
      role: h.role,
      content: h.content,
    }));

    const messages = [
      {
        role: "system",
        content: `
You are DevVoice, a smart voice AI assistant.

Rules:
- respond to the latest user speech
- use retrieved context only if relevant
- do not repeat old answers
- keep replies natural for voice output
- keep answers concise and conversational

Relevant context:
${contextText}
        `,
      },
      ...historyMessages,
      {
        role: "user",
        content: message,
      },
    ];

    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.7,
        max_tokens: 120,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API error: ${errText}`);
    }

    const data = await response.json();

    return (
      data?.choices?.[0]?.message?.content ||
      "Sorry, I couldn't generate a response."
    );
  } catch (err) {
    console.error("Groq fetch error:", err.message);

    return "I'm having trouble reaching the AI service right now. Please try again.";
  }
}

module.exports = { askClaude };