// scripts/indexer.js
// One-time script: reads your codebase → chunks → embeds → stores in Qdrant
// Usage: node scripts/indexer.js [path-to-your-code]

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { embedBatch } = require('../src/embeddings');
const { ensureCollection, upsertPoints, getStats } = require('../src/qdrant');

// ─── Config ──────────────────────────────────────────────────────
const CHUNK_SIZE = 600;       // characters per chunk
const CHUNK_OVERLAP = 100;    // overlap between chunks
const SUPPORTED_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs',
  '.java', '.cs', '.cpp', '.c', '.h', '.rb', '.php',
  '.vue', '.svelte', '.html', '.css', '.scss',
  '.md', '.txt', '.json', '.yaml', '.yml', '.env.example',
  '.sh', '.sql',
];
const IGNORED_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', '.cache', '__pycache__', 'venv', '.venv',
];

// ─── File walker ─────────────────────────────────────────────────
function walkDir(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (SUPPORTED_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

// ─── Chunker ─────────────────────────────────────────────────────
function chunkText(text, filePath) {
  const chunks = [];
  const lines = text.split('\n');
  let current = '';
  let lineStart = 1;
  let lineCount = 1;

  for (const line of lines) {
    current += line + '\n';
    if (current.length >= CHUNK_SIZE) {
      chunks.push({
        text: current.trim(),
        file: filePath,
        line_start: lineStart,
        line_end: lineCount,
      });
      // overlap: keep last N chars
      current = current.slice(-CHUNK_OVERLAP);
      lineStart = lineCount;
    }
    lineCount++;
  }

  if (current.trim().length > 20) {
    chunks.push({
      text: current.trim(),
      file: filePath,
      line_start: lineStart,
      line_end: lineCount,
    });
  }

  return chunks;
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  const targetDir = process.argv[2] || './src';
  const absDir = path.resolve(targetDir);

  console.log('\n🚀 DevVoice Indexer');
  console.log('══════════════════════════════');
  console.log(`📁 Scanning: ${absDir}`);

  if (!fs.existsSync(absDir)) {
    console.error(`❌ Directory not found: ${absDir}`);
    console.log('Usage: node scripts/indexer.js ./path/to/your/code');
    process.exit(1);
  }

  // 1. Setup Qdrant collection
  await ensureCollection();

  // 2. Walk files
  const files = walkDir(absDir);
  console.log(`📄 Found ${files.length} files`);

  if (files.length === 0) {
    console.log('⚠️  No supported files found. Check your path and file types.');
    process.exit(0);
  }

  // 3. Chunk all files
  let allChunks = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const relativePath = path.relative(absDir, file);
      const chunks = chunkText(content, relativePath);
      allChunks.push(...chunks);
    } catch (err) {
      console.warn(`⚠️  Skipped ${file}: ${err.message}`);
    }
  }
  console.log(`✂️  Created ${allChunks.length} chunks`);

  // 4. Embed in batches
  console.log('🧠 Generating embeddings...');
  const BATCH = 50;
  let pointId = Date.now(); // use timestamp as base ID to avoid conflicts
  let processed = 0;

  for (let i = 0; i < allChunks.length; i += BATCH) {
    const batch = allChunks.slice(i, i + BATCH);
    const texts = batch.map(c => `File: ${c.file}\n\n${c.text}`);

    const vectors = await embedBatch(texts);

    const points = batch.map((chunk, idx) => ({
      id: pointId++,
      vector: vectors[idx],
      payload: {
        text: chunk.text,
        file: chunk.file,
        line_start: chunk.line_start,
        line_end: chunk.line_end,
        indexed_at: new Date().toISOString(),
      },
    }));

    await upsertPoints(points);
    processed += batch.length;

    const pct = Math.round((processed / allChunks.length) * 100);
    process.stdout.write(`\r⬆️  Uploading to Qdrant... ${pct}% (${processed}/${allChunks.length})`);
  }

  console.log('\n');

  // 5. Stats
  const stats = await getStats();
  console.log('══════════════════════════════');
  console.log(`✅ Indexing complete!`);
  console.log(`   Files indexed : ${files.length}`);
  console.log(`   Chunks created: ${allChunks.length}`);
  console.log(`   Qdrant vectors: ${stats.vectors_count || allChunks.length}`);
  console.log('══════════════════════════════\n');
}

main().catch(err => {
  console.error('❌ Indexer failed:', err.message);
  process.exit(1);
});
