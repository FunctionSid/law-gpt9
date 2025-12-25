// scripts/reindex.js
// reindexes any data/*_chunks.jsonl into data/*_chunks_with_vectors.jsonl
// uses azure openai embeddings with polite retries to avoid 429s.

// usage:
//   node scripts/reindex.js

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- config ----------
const DATA_DIR = path.join(__dirname, '..', 'data');
// tune these if you still hit rate limits:
const BATCH_SIZE = 5;       // number of chunks per embeddings.create call
const BETWEEN_BATCH_MS = 1500; // wait time between batches (ms)
const MAX_RETRY = 8;          // max attempts per API call
// ----------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function okEnv() {
  const need = [
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_EMBED_DEPLOYMENT',
    'AZURE_OPENAI_API_VERSION'
  ];
  const miss = need.filter(k => !process.env[k] || String(process.env[k]).trim() === '');
  if (miss.length) {
    console.error('missing env:', miss.join(', '));
    console.error('check your .env in the project root.');
    process.exit(1);
  }
}

okEnv();

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${process.env.AZURE_OPENAI_EMBED_DEPLOYMENT}`,
  defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION }
});

function listInputFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error('data folder not found:', DATA_DIR);
    process.exit(1);
  }
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('_chunks.jsonl'));
  return files.map(f => path.join(DATA_DIR, f));
}

function loadJsonl(fp) {
  const raw = fs.readFileSync(fp, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      out.push(JSON.parse(lines[i]));
    } catch (e) {
      console.warn(`skip bad json at ${path.basename(fp)} line ${i + 1}`);
    }
  }
  return out;
}

async function embedBatch(texts, attempt = 1) {
  try {
    const res = await client.embeddings.create({
      input: texts,
      model: process.env.AZURE_OPENAI_EMBED_DEPLOYMENT
    });
    return res.data.map(d => d.embedding);
  } catch (e) {
    const status = e.status || e?.error?.status || 0;
    if (status === 429 || status === 500 || status === 503) {
      const hdr = e.headers && (e.headers.get ? e.headers.get('retry-after') : e.headers['retry-after']);
      const retrySec = hdr ? parseInt(hdr, 10) : null;
      const waitMs = retrySec ? retrySec * 1000 : Math.min(30000, 2000 * Math.pow(2, attempt - 1));
      console.warn(`rate limited / transient error (attempt ${attempt}). waiting ${Math.round(waitMs / 1000)}s...`);
      await sleep(waitMs);
      if (attempt < MAX_RETRY) return embedBatch(texts, attempt + 1);
    }
    // show short azure error
    const msg = e?.error?.message || e.message || String(e);
    console.error('embed error:', msg);
    throw e;
  }
}

async function processFile(inFile) {
  const base = path.basename(inFile);
  const outFile = inFile.replace('_chunks.jsonl', '_chunks_with_vectors.jsonl');
  const rows = loadJsonl(inFile);

  if (!rows.length) {
    console.warn(`no rows found in ${base}, skip`);
    return;
  }

  console.log(`\nprocessing: ${base}`);
  console.log(`total rows: ${rows.length}`);
  console.log(`writing -> ${path.basename(outFile)}`);

  // stream output to avoid huge memory
  const ws = fs.createWriteStream(outFile, { encoding: 'utf8' });

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const texts = slice.map(r => (r.text ?? r.content ?? '').toString());
    const embs = await embedBatch(texts);

    for (let j = 0; j < slice.length; j++) {
      const r = slice[j];
      const rec = {
        id: r.id || r.chunk_id || r.uid || `c_${i + j}`,
        text: r.text || r.content || '',
        embedding: embs[j],
        source: r.source || r.meta?.source || r.file || base,
        page: r.page || r.meta?.page || null,
        heading: r.heading || r.meta?.heading || null,
        article: r.article || r.meta?.article || null,
        section_number: r.section_number || r.meta?.section_number || null,
        section_title: r.section_title || r.meta?.section_title || null,
        meta: r.meta || {}
      };
      ws.write(JSON.stringify(rec) + '\n');
    }

    done += slice.length;
    const pct = ((done / rows.length) * 100).toFixed(1);
    process.stdout.write(`embedded ${done} / ${rows.length} (${pct}%)\r`);
    await sleep(BETWEEN_BATCH_MS);
  }

  ws.end();
  await new Promise(res => ws.on('close', res));
  console.log(`\nwrote ${path.basename(outFile)}\n`);
}

async function run() {
  const files = listInputFiles();
  if (!files.length) {
    console.log('no *_chunks.jsonl files found in /data. nothing to do.');
    console.log('tip: create them with: node scripts/make_chunks_from_text.js --input data/raw/constitution_of_india_text.txt --source constitution_of_india --type constitution');
    return;
  }

  console.log('embedding with deployment:', process.env.AZURE_OPENAI_EMBED_DEPLOYMENT);
  console.log('api version:', process.env.AZURE_OPENAI_API_VERSION);
  console.log('data dir:', DATA_DIR);

  for (const f of files) {
    await processFile(f);
  }

  console.log('done.');
}

run().catch(e => {
  console.error('fatal:', e?.message || e);
  process.exit(1);
});
