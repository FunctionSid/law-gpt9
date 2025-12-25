import express from "express";
import Database from "better-sqlite3";
import { 
  search, 
  findByArticle, 
  findBySection, 
  simpleAnswer 
} from "../utils/retriever.js";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

// --- Configuration ---
const MAX_CONTEXT_CHARS = 30000;
const MAX_ANSWER_TOKENS = 800;
const DB_PATH = "./data/sqlite3/lawgpt_vectors.sqlite";

// Azure Setup
const AZ_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZ_DEPLOY = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT; 
const AZ_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZ_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-06-01";
const hasAzure = Boolean(AZ_ENDPOINT && AZ_DEPLOY && AZ_KEY);

// --- Helper Functions ---

// 1. Text Cleaner: Removes underscores (____) and junk for screen readers
function cleanLegalText(text) {
  if (!text) return "";
  return text
    .replace(/_{2,}/g, '')       // Removes long lines of underscores
    .replace(/\s\s+/g, ' ')      // Removes extra spaces
    .replace(/Page \d+/g, '')    // Removes "Page 123" marks
    .replace(/[^\x20-\x7E]/g, '') // Removes non-readable special symbols
    .trim();
}

// 2. Filter: Searches BOTH Constitution and BNS by default
function filterByDataset(hits, dataset) {
  const ds = (dataset || "all").toLowerCase().trim();
  if (!ds || ds === "all" || ds === "none") return hits;
  
  const isConst = ds.includes("constitution");
  const isBns = ds.includes("bns") || ds.includes("nyaya") || ds.includes("sanhita");

  return hits.filter(h => {
    const src = (h.source || "").toLowerCase();
    if (isBns) return src.includes("bns") || src.includes("bharatiya");
    if (isConst) return src.includes("constitution");
    return true; 
  });
}

// 3. Format Context for AI
function makeContextBlocks(hits, limit = 12) {
  const blocks = [];
  let total = 0;
  for (let i = 0; i < Math.min(hits.length, limit); i++) {
    const h = hits[i];
    // We clean the text here before sending to AI
    const txt = cleanLegalText(h.text || "").slice(0, 2000); 
    let label = `[SOURCE ${i + 1}]`;
    if (h.article) label += ` Article ${h.article}`;
    if (h.section_number) label += ` Section ${h.section_number}`;
    label += ` | File: ${h.source || "Unknown"}`;
    const block = `${label}\n${txt}`;
    if (total + block.length > MAX_CONTEXT_CHARS) break;
    blocks.push(block);
    total += block.length;
  }
  return blocks.join("\n\n---\n\n");
}

// 4. Azure Chat Function
async function azureChat(messages) {
  if (!hasAzure) throw new Error("Azure OpenAI not configured.");
  const url = `${AZ_ENDPOINT}openai/deployments/${AZ_DEPLOY}/chat/completions?api-version=${AZ_VERSION}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "api-key": AZ_KEY, "content-type": "application/json" },
    body: JSON.stringify({ messages, temperature: 0, max_tokens: MAX_ANSWER_TOKENS }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure Error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

// --- Routes ---

router.get("/chat", (req, res) => {
  res.render("chat");
});

router.post("/ask", async (req, res) => {
  try {
    const q = (req.body?.q || "").trim();
    const dataset = (req.body?.dataset || "all").trim(); 
    if (!q) return res.status(400).json({ error: "Empty question" });

    const lower = q.toLowerCase();

    // --- STEP 1: Check for Statistics (NJDG Data) ---
    const isStatsQuery = lower.includes("pending") || lower.includes("case") || lower.includes("stat");
    if (isStatsQuery) {
      const db = new Database(DB_PATH);
      const stats = db.prepare("SELECT * FROM judicial_stats ORDER BY fetched_at DESC LIMIT 3").all();
      db.close();

      if (stats.length > 0) {
        const statsList = stats.map(s => `${s.metric}: ${s.count.toLocaleString()}`).join(", ");
        const dateString = new Date(stats[0].fetched_at).toLocaleDateString();
        return res.json({ 
          answer: `Based on the latest data from the National Judicial Data Grid (fetched on ${dateString}): ${statsList}.`, 
          mode: "statistics", 
          sources: [{ source: "NJDG Live Data", section: "National Statistics" }] 
        });
      }
    }

    // --- STEP 2: Legal Text Search ---
    let hits = [];
    let mode = "hybrid";
    const mArticle = lower.match(/\b(article|art\.?)\s*(\d+)/);
    const mSection = lower.match(/\b(section|sec\.?)\s*(\d+)/);

    if (mArticle) {
      hits = await findByArticle(mArticle[2]);
      mode = "direct-article";
    } else if (mSection) {
      hits = await findBySection(mSection[2]);
      mode = "direct-section";
    } else {
      hits = await search(q);
    }

    hits = filterByDataset(hits, dataset);
    const sources = hits.map((h, i) => ({
      idx: i + 1,
      source: h.source,
      section: h.section_number || h.article || "General",
      text: cleanLegalText(h.text ? h.text.slice(0, 150) : "") + "..."
    }));

    // --- STEP 3: Generate Response ---
    if (!hasAzure) {
      const basic = simpleAnswer(hits);
      // Clean fallback text for screen reader
      basic.answer = cleanLegalText(basic.answer);
      return res.json({ ...basic, mode, sources });
    }

    try {
      const context = makeContextBlocks(hits);
      const messages = [
        { role: "system", content: "You are LawGPT. Answer in simple Grade-8 English using ONLY the provided Legal Context. If not in context, say you don't know." },
        { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION: ${q}` }
      ];
      const answer = await azureChat(messages);
      res.json({ answer, mode, sources });
    } catch (err) {
      console.error("Azure Error:", err.message);
      const fallback = simpleAnswer(hits);
      // Clean fallback text for screen reader
      const cleanFallback = cleanLegalText(fallback.answer);
      res.json({ answer: cleanFallback, mode, error: "AI Busy - Showing clean law text", sources });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default router;