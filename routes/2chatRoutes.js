import express from 'express';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { AzureOpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// --- Configuration ---
const DB_PATH = './data/sqlite3/lawgpt_vectors.sqlite'; 
const EMBED_DIMENSION = 1536;
const MAX_DISTANCE_SCORE = 0.85; 

// --- Setup Azure Client ---
const client = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  apiVersion: "2024-06-01"
});

// --- Connect to Database ---
let db;
try {
  db = new Database(DB_PATH);
  sqliteVec.load(db);
  console.log('✅ Database connected in Chat Route.');
} catch (err) {
  console.error("❌ Failed to connect to database.", err.message);
}

// ==========================================
//        1. UTILITIES (Spell Check, Logic)
// ==========================================
function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

const LEGAL_KEYWORDS = [
    "article", "section", "constitution", "bharatiya", "nyaya", "sanhita",
    "punishment", "imprisonment", "fine", "penalty", "offence", "crime",
    "murder", "theft", "rape", "assault", "kidnapping", "dowry",
    "fundamental", "right", "liberty", "equality", "justice", "bail", "arrest"
];

function correctTypos(text) {
    const words = text.split(" ");
    const correctedWords = words.map(word => {
        const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, ""); 
        if (cleanWord.length < 4) return word; 
        for (const keyword of LEGAL_KEYWORDS) {
            const distance = levenshtein(cleanWord, keyword);
            if (distance <= 2 && Math.abs(cleanWord.length - keyword.length) <= 2) {
                return keyword; 
            }
        }
        return word; 
    });
    return correctedWords.join(" ");
}

// ==========================================
//        2. SMART TRANSLATOR (Explicit Old Flag)
// ==========================================
const IPC_TO_BNS = {
    "302": "103",   // Murder
    "307": "109",   // Attempt Murder
    "376": "64",    // Rape
    "375": "63",    // Rape Def
    "378": "303",   // Theft Def
    "379": "303",   // Theft Punish
    "420": "318",   // Cheating
    "498a": "85",   // Cruelty
    "124a": "152",  // Sedition
    "500": "356"    // Defamation
};

function translateQuery(text) {
    const lower = text.toLowerCase();
    
    // --- FLAG CHECK ---
    const hasOldFlag = lower.includes("ipc") || lower.includes("old") || lower.includes("1860");

    if (!hasOldFlag) {
        return { newQuery: text, note: "" }; // Default: New Law
    }

    // --- TRANSLATION LOGIC ---
    for (const [ipc, bns] of Object.entries(IPC_TO_BNS)) {
        if (lower.includes(ipc)) {
            return {
                newQuery: `${text} (Refers to BNS Section ${bns})`,
                note: `(Note: You asked for Old/IPC Section ${ipc}. In the new BNS 2023 law, this is covered by Section ${bns}.)`
            };
        }
    }
    
    return { newQuery: text, note: "" };
}

// ==========================================
//        3. STATS LOGIC (NJDG Guard)
// ==========================================
function getJudicialStats() {
    try {
        const rows = db.prepare("SELECT * FROM judicial_stats ORDER BY id DESC").all();
        if (!rows.length) return null;
        
        let report = "Here are the latest aggregated statistics from the National Judicial Data Grid (NJDG):\n";
        rows.forEach(r => {
            report += `- ${r.metric}: ${r.count.toLocaleString()} cases\n`;
        });
        report += `(Data retrieved: ${rows[0].fetched_at.split('T')[0]})`;
        return report;
    } catch (e) {
        console.error("Stats Error:", e);
        return null;
    }
}

// ==========================================
//        4. SCOPE & IDENTITY LOGIC
// ==========================================
function isIdentityQuestion(text) {
    const lower = text.toLowerCase();
    const keywords = ["who are you", "who made you", "created you", "your name", "hi", "hello", "namaste"];
    return keywords.some(k => lower.includes(k));
}

function detectLawScope(text) {
    const lower = text.toLowerCase();
    const constKeywords = ["article", "constitution", "fundamental right", "preamble", "liberty", "equality"];
    const bnsKeywords = ["section", "bns", "sanhita", "punishment", "imprisonment", "fine", "murder", "theft"];

    const hasConst = constKeywords.some(k => lower.includes(k));
    const hasBNS = bnsKeywords.some(k => lower.includes(k));

    if (hasConst && !hasBNS) return "constitution";
    if (hasBNS && !hasConst) return "bharatiya"; 
    return "all"; 
}

// --- API Route: /ask ---
router.post('/ask', async (req, res) => {
  try {
    let userQuestion = req.body.q || req.body.message;
    console.log(`\n❓ Original Question: "${userQuestion}"`);

    if (!userQuestion) return res.status(400).json({ error: "No question provided." });

    // Step A: Correct Typos
    userQuestion = correctTypos(userQuestion);
    console.log(`✨ Corrected Question: "${userQuestion}"`);

    // --- NEW: CHECK FOR STATS QUESTIONS ---
    const lowerQ = userQuestion.toLowerCase();
    const statsKeywords = ["how many cases", "pending cases", "total cases", "court stats", "njdg", "judicial data", "pendency"];
    
    if (statsKeywords.some(k => lowerQ.includes(k))) {
        console.log("   -> Detected Stats Question. Fetching from DB...");
        const statsReport = getJudicialStats();
        if (statsReport) {
            return res.json({
                answer: statsReport,
                reply: statsReport,
                sources: [{ source: "National Judicial Data Grid (NJDG)", page: "Public Dashboard" }]
            });
        }
        // If no stats found, fall through to normal AI search...
    }

    // Step B: Translate ONLY if Old Flag exists
    const { newQuery, note } = translateQuery(userQuestion);
    if (note) console.log(`🔄 Translated: IPC -> BNS`);

    let legalContext = "";
    let sourcesList = [];
    
    if (isIdentityQuestion(userQuestion)) {
        console.log("   -> Identity Question. Skipping DB.");
        legalContext = "The user is asking about your identity. Answer naturally: You are LawGPT, created by Siddharth.";
    } 
    else {
        const scope = detectLawScope(userQuestion);
        console.log(`   -> Smart Scope: [${scope.toUpperCase()}]`);

        // Step C: Embed the Query
        const embedResponse = await client.embeddings.create({
            model: process.env.AZURE_OPENAI_EMBED_DEPLOYMENT, 
            input: newQuery,
            dimensions: EMBED_DIMENSION
        });
        const qVector = new Float32Array(embedResponse.data[0].embedding);

        const query = db.prepare(`
            SELECT rowid, distance
            FROM vectors
            WHERE embedding MATCH ?
                AND k = 10 
            ORDER BY distance ASC
        `);
        const matches = query.all(qVector);

        const getDoc = db.prepare('SELECT text, source, meta FROM documents WHERE id = ?');
        
        let count = 0;
        for (const match of matches) {
            if (count >= 3) break; 
            if (match.distance > MAX_DISTANCE_SCORE) continue;

            const doc = getDoc.get(BigInt(match.rowid));
            if (doc) {
                const sourceName = doc.source.toLowerCase();
                if (scope === "constitution" && !sourceName.includes("constitution")) continue;
                if (scope === "bharatiya" && !sourceName.includes("bharatiya")) continue;

                legalContext += `\n[Source: ${doc.source}]\n${doc.text}\n`;
                
                let metaObj = {};
                try { metaObj = JSON.parse(doc.meta); } catch(e) {}

                sourcesList.push({
                    source: doc.source,
                    page: metaObj.page || null,          
                    article: metaObj.article || null,     
                    section: metaObj.section_number || null, 
                    score: match.distance.toFixed(3)
                });
                count++;
            }
        }
    }

    if (!isIdentityQuestion(userQuestion) && sourcesList.length === 0) {
        return res.json({ 
            answer: "I could not find specific details for that in the relevant law book.",
            reply: "I could not find specific details for that in the relevant law book.",
            sources: [] 
        });
    }

    const systemPrompt = `
      You are LawGPT, a helpful AI Legal Assistant for India.
      
      INSTRUCTIONS:
      1. Answer using ONLY the provided 'Legal Context'.
      2. If the context has sections/articles, cite them clearly.
      3. Use simple, clear English (8th-grade level).
      4. If the user explicitly asked for an IPC/Old section, mention the new BNS section from the Note.
    `;

    const finalUserPrompt = `
        ${note ? "SYSTEM NOTE: " + note : ""}
        
        Legal Context:
        ${legalContext}
        
        User Question: ${userQuestion}
    `;

    const chatCompletion = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT, 
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: finalUserPrompt }
      ],
      temperature: 0.3
    });

    const finalAnswer = chatCompletion.choices[0].message.content;
    console.log("✅ Answer generated.");

    res.json({ 
        answer: finalAnswer, 
        reply: finalAnswer,
        sources: sourcesList
    });

  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).json({ error: "Server error." });
  }
});

export default router;