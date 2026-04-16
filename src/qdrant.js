// src/qdrant.js
// Handles all Qdrant operations: collection setup, upsert, search

require('dotenv').config();
const { QdrantClient } = require('@qdrant/js-client-rest');

const client = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
  checkCompatibility: false,
});

const COLLECTION = process.env.QDRANT_COLLECTION || 'devvoice';

// ⚠️ IMPORTANT: Jina embeddings are 768-dimensional (not 1536 like OpenAI)
// If you already have a collection from the old setup, delete it in Qdrant
// dashboard and let this recreate it, or change QDRANT_COLLECTION to a new name.
const VECTOR_SIZE = 768;

async function ensureCollection() {
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION);

    if (!exists) {
      await client.createCollection(COLLECTION, {
        vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
      });
      console.log(`✅ Created Qdrant collection: ${COLLECTION} (${VECTOR_SIZE}d)`);
    } else {
      console.log(`✅ Qdrant collection exists: ${COLLECTION}`);
    }
  } catch (err) {
    console.error('❌ Qdrant collection setup failed:', err.message);
    throw err;
  }
}

async function upsertPoints(points) {
  await client.upsert(COLLECTION, { points, wait: true });
}

async function search(vector, limit = 4) {
  const results = await client.search(COLLECTION, {
    vector,
    limit,
    with_payload: true,
    score_threshold: 0.3,
  });
  return results;
}

async function getStats() {
  try {
    const info = await client.getCollection(COLLECTION);
    return {
      vectors_count: info.vectors_count || 0,
      points_count: info.points_count || 0,
      status: info.status,
    };
  } catch {
    return { vectors_count: 0, points_count: 0, status: 'not_found' };
  }
}

module.exports = { ensureCollection, upsertPoints, search, getStats, client, COLLECTION };
