// utils/retriever.js
import Database from 'better-sqlite3';
import path from "path";
import { fileURLToPath } from "url";
import { azureClient, CONFIG } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- LINUX PATHS FOR AZURE ---
// We use forward slashes (/) and the .so extension for Linux
const DB_FILE = path.resolve(__dirname, "..", "data/sqlite3/lawgpt_vectors.sqlite");
const EXT_FILE = path.resolve(__dirname, "..", "node_modules/sqlite-vec-linux-x64/vec0.so");

let db = null;
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * Initializes DB and loads the Linux vector engine.
 */
export async function init() {
    if (db) return;
    try {
        db = new Database(DB_FILE, { fileMustExist: true });
        
        // Load the Linux-specific vector extension
        db.loadExtension(EXT_FILE);
        console.log("✅ Database & Linux Vector Extension Connected.");
    } catch (err) {
        console.error("❌ Linux DB Init Error:", err.message);
        throw err;
    }
}

/**
 * SHARED: Fetches embeddings with automatic retry (prevents 429 errors).
 */
async function embedWithRetry(q, retries = 3) {
    const url = `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${process.env.AZURE_OPENAI_EMBED_DEPLOYMENT}/embeddings?api-version=${process.env.AZURE_OPENAI_API_VERSION}`;
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "api-key": process.env.AZURE_OPENAI_API_KEY, "content-type": "application/json" },
                body: JSON.stringify({ input: q }),
            });
            if (res.status === 429) {
                const wait = Math.pow(2, i + 1) * 1000;
                console.warn(`⚠️ Rate Limit: Waiting ${wait/1000}s before retrying...`);
                await sleep(wait);
                continue;
            }
            const data = await res.json();
            return data.data[0].embedding;
        } catch (err) { if (i === retries - 1) throw err; }
    }
}

/**
 * SHARED: AI Reranker that picks the best 5 results.
 */
async function rerankWithRetry(query, candidates, retries = 3) {
    if (!candidates || candidates.length === 0) return [];
    const prompt = `User Query: "${query}"\nReview segments:\n${candidates.map((c, i) => `[${i}] ${c.text.slice(0, 400)}`).join("\n")}\nReturn JSON array of relevant indices.`;

    for (let i = 0; i < retries; i++) {
        try {
            const response = await azureClient.chat.completions.create({
                model: CONFIG.chatModel,
                messages: [{ role: "system", content: "Return JSON indices only." }, { role: "user", content: prompt }],
                response_format: { type: "json_object" }
            });
            const content = JSON.parse(response.choices[0].message.content);
            const indices = Array.isArray(content) ? content : (content.indices || []);
            return indices.map(idx => candidates[idx]).filter(Boolean).slice(0, 5);
        } catch (err) {
            if (err.status === 429 && i < retries - 1) {
                await sleep(Math.pow(2, i + 1) * 1000);
                continue;
            }
            return candidates.slice(0, 5); 
        }
    }
}

/**
 * MAIN SEARCH: Combines Math (vectors) with Text (documents).
 */
export async function search(q, k = 5, dataset = "all") {
    await init();
    const queryVector = await embedWithRetry(q);
    const vectorBuffer = Buffer.from(new Float32Array(queryVector).buffer);

    const sql = `
        SELECT d.id, d.text, d.source FROM vectors v
        JOIN documents d ON v.rowid = d.id
        WHERE v.embedding MATCH ? AND k = 10 
        ORDER BY v.distance ASC
    `;

    try {
        let hits = db.prepare(sql).all(vectorBuffer);
        if (dataset !== "all") hits = hits.filter(h => h.source.toLowerCase().includes(dataset.toLowerCase()));
        return await rerankWithRetry(q, hits);
    } catch (err) { return []; }
}

/**
 * DIRECT LOOKUP: Keyword Search for Articles and Sections.
 */
export async function findByArticle(id) {
    await init();
    return db.prepare(`SELECT text, source FROM documents WHERE text LIKE ? LIMIT 5`).all(`%Article ${id}%`);
}

export async function findBySection(id) {
    await init();
    return db.prepare(`SELECT text, source FROM documents WHERE text LIKE ? LIMIT 5`).all(`%Section ${id}%`);
}
