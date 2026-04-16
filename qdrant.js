const { QdrantClient } = require("@qdrant/js-client-rest");
require("dotenv").config();

const client = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

module.exports = client;