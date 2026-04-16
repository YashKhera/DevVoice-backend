require('dotenv').config();
const { QdrantClient } = require('@qdrant/js-client-rest');
console.log(process.env.QDRANT_URL);
const client = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
  checkCompatibility: false,
});

async function test() {
  const collections = await client.getCollections();
  console.log(collections);
}

test().catch(console.error);