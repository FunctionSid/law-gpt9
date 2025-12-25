// D:\project\law-gpt-linux\scripts\build_vectors.cjs
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const dotenv = require("dotenv");
const OpenAI = require("openai");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

dotenv.config();

const projectRoot = process.cwd();
const rawDir = path.join(projectRoot, "data", "raw");
const dbDir = path.join(projectRoot, "data", "sqlite3");
const dbPath = path.join(dbDir, "lawgpt_vectors.sqlite");

const files = [
  { name: "Constitution of India", file: "constitution_of_india_text.txt", category: "constitution" },
  { name: "Bharatiya Nyaya Sanhita 2023", file: "bharatiya_nyaya_sanhita_2023_text.txt", category: "criminal_law" },
];

const EMBED_DIM = 1536;

const ENV_BATCH = parseInt(process.env.EMBED_BATCH || "2", 10);
const ENV_PAUSE = parseInt(process.env.EMBED_PAUSE_MS || "1500", 10);
const SAFE_FALLBACK_OPENAI = String(process.env.SAFE_FALLBACK_OPENAI || "false").toLowerCase() === "true";

function ensureDirs() {
  if (!fs.existsSync(rawDir)) throw new Error(`raw folder not found: ${rawDir}`);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function chunkText(text, target = 1400, overlap = 200) {
  const paras = text.split(/\r?\n\s*\r?\n/);
  const chunks = [];
  let cur = "";
  for (const p of paras) {
    const candidate = cur ? cur + "\n\n" + p : p;
    if (candidate.length <= target) {
      cur = candidate;
    } else {
      if (cur) chunks.push(cur);
      if (p.length <= target) {
        const tail = chunks.length ? chunks[chunks.length - 1] : "";
        const carry = tail ? tail.slice(-overlap) : "";
        cur = carry ? carry + "\n\n" + p : p;
      } else {
        let i = 0;
        while (i < p.length) {
          const part = p.slice(i, i + target);
          chunks.push(part);
          i += Math.max(1, target - overlap);
        }
        cur = "";
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks.map(s => s.trim()).filter(Boolean);
}

function openDb() {
  const db = new Database(dbPath);
  const vecExt = process.env.SQLITE_VEC_PATH;
  if (vecExt) {
    if (fs.existsSync(vecExt)) {
      try {
        db.loadExtension(vecExt);
        console.log(`sqlite vec extension loaded from: ${vecExt}`);
      } catch (e) {
        console.error("failed to load sqlite vec extension:", e.message);
      }
    } else {
      console.error(`sqlite vec extension path not found: ${vecExt}`);
    }
  }

  db.pragma("journal_mode = wal");
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      category TEXT,
      sha256 TEXT,
      bytes INTEGER,
      added_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY,
      doc_id INTEGER NOT NULL,
      chunk_no INTEGER NOT NULL,
      text TEXT NOT NULL,
      token_est INTEGER,
      embedding BLOB NOT NULL,
      UNIQUE(doc_id, chunk_no),
      FOREIGN KEY(doc_id) REFERENCES documents(id)
    );
  `);

  let hasVec = false;
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_index USING vec0(embedding float[${EMBED_DIM}]);`);
    hasVec = true;
  } catch {
    hasVec = false;
  }
  return { db, hasVec };
}

function floatArrayToBlob(arr) {
  const f32 = new Float32Array(arr);
  return Buffer.from(f32.buffer);
}

async function makeAzureClient() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-06-01";
  const deployment = process.env.AZURE_OPENAI_EMBED_DEPLOYMENT;
  if (!endpoint || !apiKey || !deployment) {
    throw new Error("missing azure openai env vars (endpoint/key/deployment).");
  }
  return new OpenAI({
    apiKey,
    baseURL: `${endpoint}/openai/deployments/${deployment}`,
    defaultHeaders: { "api-key": apiKey },
    defaultQuery: { "api-version": apiVersion },
  });
}

async function makeStdClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is missing");
  return new OpenAI({ apiKey: key });
}

async function embedBatch(client, model, batch) {
  const res = await client.embeddings.create({ model, input: batch });
  return res.data.map(d => d.embedding);
}

// robust Azure embeddings: small batches, pauses, retry, per-item fallback
async function getEmbeddingsAzure(texts) {
  const client = await makeAzureClient();
  const model = process.env.AZURE_OPENAI_EMBED_DEPLOYMENT;

  const out = [];
  const BATCH = Math.max(1, ENV_BATCH);
  const PAUSE_MS = Math.max(0, ENV_PAUSE);
  const MAX_ATTEMPTS = 6;

  const isRetryable = (e) => {
    const msg = String(e && (e.message || e.toString())).toLowerCase();
    const code = e && e.status;
    return (
      code === 429 ||
      code === 500 || code === 502 || code === 503 || code === 504 ||
      msg.includes("timeout") || msg.includes("timed out") || msg.includes("request timed out") ||
      msg.includes("ecconnreset") || msg.includes("socket hang up")
    );
  };

  const backoff = async (attempt) => {
    const waitMs = Math.min(30000 * Math.pow(2, attempt - 1), 300000);
    console.log(`retrying after ${Math.round(waitMs/1000)}s (attempt ${attempt})...`);
    await sleep(waitMs);
  };

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);

    let attempt = 0;
    while (true) {
      try {
        const embs = await embedBatch(client, model, batch);
        out.push(...embs);
        break;
      } catch (e) {
        if (!isRetryable(e)) throw e;
        attempt++;
        if (attempt <= MAX_ATTEMPTS) {
          console.log(`batch ${i + 1}-${i + batch.length} failed (${e.status || ""} ${e.message || e}).`);
          await backoff(attempt);
          continue;
        }
        console.log(`falling back to per-item embedding for batch ${i + 1}-${i + batch.length}...`);
        for (let j = 0; j < batch.length; j++) {
          let oneAttempt = 0;
          while (true) {
            try {
              const embs = await embedBatch(client, model, [batch[j]]);
              out.push(embs[0]);
              break;
            } catch (e2) {
              if (!isRetryable(e2)) throw e2;
              oneAttempt++;
              if (oneAttempt > MAX_ATTEMPTS) {
                throw new Error(`failed to embed item ${i + j + 1} after retries: ${e2.message || e2}`);
              }
              await backoff(oneAttempt);
            }
          }
        }
        break;
      }
    }

    if (PAUSE_MS > 0) await sleep(PAUSE_MS);
  }

  return out;
}

// optional fallback to standard OpenAI (enable by setting SAFE_FALLBACK_OPENAI=true and OPENAI_API_KEY in .env)
async function getEmbeddingsStd(texts) {
  const client = await makeStdClient();
  const model = process.env.AZURE_OPENAI_EMBED_MODEL || "text-embedding-3-small";

  const out = [];
  const BATCH = Math.max(1, ENV_BATCH);
  const PAUSE_MS = Math.max(0, ENV_PAUSE);
  const MAX_ATTEMPTS = 6;

  const isRetryable = (e) => {
    const msg = String(e && (e.message || e.toString())).toLowerCase();
    const code = e && e.status;
    return (
      code === 429 ||
      code === 500 || code === 502 || code === 503 || code === 504 ||
      msg.includes("timeout") || msg.includes("timed out") || msg.includes("request timed out") ||
      msg.includes("ecconnreset") || msg.includes("socket hang up")
    );
  };

  const backoff = async (attempt) => {
    const waitMs = Math.min(30000 * Math.pow(2, attempt - 1), 300000);
    console.log(`(fallback) retrying after ${Math.round(waitMs/1000)}s (attempt ${attempt})...`);
    await sleep(waitMs);
  };

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    let attempt = 0;
    while (true) {
      try {
        const embs = await embedBatch(client, model, batch);
        out.push(...embs);
        break;
      } catch (e) {
        if (!isRetryable(e)) throw e;
        attempt++;
        if (attempt <= MAX_ATTEMPTS) {
          console.log(`(fallback) batch ${i + 1}-${i + batch.length} failed (${e.status || ""} ${e.message || e}).`);
          await backoff(attempt);
          continue;
        }
        console.log(`(fallback) falling back to per-item for batch ${i + 1}-${i + batch.length}...`);
        for (let j = 0; j < batch.length; j++) {
          let oneAttempt = 0;
          while (true) {
            try {
              const embs = await embedBatch(client, model, [batch[j]]);
              out.push(embs[0]);
              break;
            } catch (e2) {
              if (!isRetryable(e2)) throw e2;
              oneAttempt++;
              if (oneAttempt > MAX_ATTEMPTS) {
                throw new Error(`(fallback) failed to embed item ${i + j + 1} after retries: ${e2.message || e2}`);
              }
              await backoff(oneAttempt);
            }
          }
        }
        break;
      }
    }
    if (PAUSE_MS > 0) await sleep(PAUSE_MS);
  }
  return out;
}

async function getEmbeddingsPreferAzure(texts) {
  try {
    return await getEmbeddingsAzure(texts);
  } catch (e) {
    console.error("azure embedding failed:", e.message || e);
    if (SAFE_FALLBACK_OPENAI) {
      console.log("using standard OpenAI fallback (SAFE_FALLBACK_OPENAI=true)...");
      return await getEmbeddingsStd(texts);
    }
    console.error("not switching automatically. set SAFE_FALLBACK_OPENAI=true and provide OPENAI_API_KEY in .env to enable fallback.");
    process.exit(1);
  }
}

function upsertDocument(db, doc) {
  const sel = db.prepare(`SELECT id, sha256 FROM documents WHERE path = ?`);
  const row = sel.get(doc.path);
  if (!row) {
    const ins = db.prepare(`INSERT INTO documents (name, path, category, sha256, bytes) VALUES (?, ?, ?, ?, ?)`);
    const info = ins.run(doc.name, doc.path, doc.category, doc.sha256, doc.bytes);
    return { id: info.lastInsertRowid, rebuild: true };
  } else {
    if (row.sha256 !== doc.sha256) {
      db.prepare(`UPDATE documents SET sha256 = ?, bytes = ?, added_at = datetime('now') WHERE id = ?`)
        .run(doc.sha256, doc.bytes, row.id);
      db.prepare(`DELETE FROM chunks WHERE doc_id = ?`).run(row.id);
      return { id: row.id, rebuild: true };
    } else {
      return { id: row.id, rebuild: false };
    }
  }
}

function insertChunks(db, hasVec, docId, parts, embeddings) {
  const ins = db.prepare(`INSERT OR REPLACE INTO chunks (doc_id, chunk_no, text, token_est, embedding) VALUES (?, ?, ?, ?, ?)`);
  const insertBatch = (start, end) => {
    const tx = db.transaction(() => {
      for (let i = start; i < end; i++) {
        const text = parts[i];
        const emb = embeddings[i];
        const blob = floatArrayToBlob(emb);
        const tokenEst = Math.ceil(text.length / 4);
        const chunkNo = i + 1;
        const info = ins.run(docId, chunkNo, text, tokenEst, blob);
        const chunkId = info.lastInsertRowid;
        if (hasVec) {
          db.prepare(`INSERT OR REPLACE INTO vec_index(rowid, embedding) VALUES (?, ?);`).run(chunkId, blob);
        }
      }
    });
    tx();
  };

  const step = 200;
  for (let i = 0; i < parts.length; i += step) {
    insertBatch(i, Math.min(i + step, parts.length));
  }
}

(async function main() {
  ensureDirs();
  const { db, hasVec } = openDb();

  for (const f of files) {
    const fullPath = path.join(rawDir, f.file);
    const buf = fs.readFileSync(fullPath);
    const text = buf.toString("utf8").replace(/\u0000/g, " ");
    const hash = sha256(buf);

    const relPath = path.relative(projectRoot, fullPath).split(path.sep).join("/");

    const status = upsertDocument(db, {
      name: f.name,
      path: relPath,
      category: f.category,
      sha256: hash,
      bytes: buf.length,
    });

    if (!status.rebuild) {
      console.log(`${f.name}: source unchanged, skipping (already in DB).`);
      continue;
    }

    const parts = chunkText(text, 1400, 200);
    if (parts.length === 0) {
      console.log(`${f.name}: no content found, skipping`);
      continue;
    }

    console.log(`${f.name}: embedding ${parts.length} chunks in batches...`);
    const embeddings = await getEmbeddingsPreferAzure(parts);
    if (!embeddings || embeddings.length !== parts.length) {
      throw new Error("embedding count mismatch");
    }

    insertChunks(db, hasVec, status.id, parts, embeddings);
    console.log(`${f.name}: ${parts.length} chunks indexed`);
  }

  console.log(`done. sqlite at: ${dbPath}`);
  console.log(hasVec ? "vector index: enabled (vec0)" : "vector index: not enabled (store only)");
  db.close();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
