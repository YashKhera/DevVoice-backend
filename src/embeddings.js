// src/embeddings.js
// Converts text → vectors using Jina AI embeddings (FREE tier — no credit card needed)
// Sign up at: https://jina.ai  → get your free API key

require('dotenv').config();
const axios = require('axios');

const JINA_API_KEY = process.env.JINA_API_KEY;
const JINA_MODEL = 'jina-embeddings-v2-base-code'; // Best for code — free tier
const VECTOR_SIZE = 768; // jina-embeddings-v2-base-code output size

/**
 * Embed a single string → returns float array
 */
async function embed(text) {
  const response = await axios.post(
    'https://api.jina.ai/v1/embeddings',
    {
      model: JINA_MODEL,
      input: [text.slice(0, 8000)],
    },
    {
      headers: {
        Authorization: `Bearer ${JINA_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data.data[0].embedding;
}

/**
 * Embed multiple strings in batch
 */
async function embedBatch(texts) {
  const BATCH_SIZE = 50;
  const results = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map(t => t.slice(0, 8000));
    const response = await axios.post(
      'https://api.jina.ai/v1/embeddings',
      { model: JINA_MODEL, input: batch },
      {
        headers: {
          Authorization: `Bearer ${JINA_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    results.push(...response.data.data.map(d => d.embedding));
  }

  return results;
}

module.exports = { embed, embedBatch, VECTOR_SIZE };
