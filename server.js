import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Telegraf } from 'telegraf';
import Database from "better-sqlite3";

// 1. Centralized Utility Imports
import { CONFIG } from "./config.js";
import { ipcMap } from "./utils/ipc_map.js";
import { classifyIntent } from "./utils/classifier.js";
import { azureChat } from "./utils/azureClient.js";
import { getBasicResponse } from "./utils/basicResponses.js";
import { init, search, findByArticle, findBySection } from "./utils/retriever.js";
import { initStatsCron } from "./utils/statsAutomation.js";

// --- NEW SERVICE IMPORTS ---
import { getJudicialStats } from "./utils/judicialService.js";
import { searchByCNR } from "./utils/cnrService.js";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- SESSION & LOGGING ---
const chatHistory = new Map(); 
const LOG_FILE = path.join(__dirname, 'server.log');
const DB_PATH = path.resolve(__dirname, "data", "sqlite3", "lawgpt_vectors.sqlite");

function log(message) {
    const logLine = `[${new Date().toLocaleTimeString()}] ${message}`;
    console.log(logLine);
    try {
        fs.appendFileSync(LOG_FILE, logLine + '\n');
    } catch (err) { /* silent log fail */ }
}

// --- CORE LOGIC: SHARED PROCESSOR ---
async function processLegalQuery(userQuery, requestedDataset) {
    let q = userQuery.trim();
    let lower = q.toLowerCase();
    let dataset = requestedDataset || "all";
    let notice = "";

    // A. Local Small Talk (Saves $$ and Time)
    const basic = getBasicResponse(q);
    if (basic) return { isBasic: true, answer: basic };

    // B1. NEW: Check for CNR Number (High Priority)
    // Automatically detects if the user entered a 16-digit alphanumeric CNR
    const cnrMatch = q.match(/[A-Z0-9]{16}/i);
    if (cnrMatch) {
        const cnrResult = searchByCNR(cnrMatch[0]);
        return { isBasic: true, answer: cnrResult };
    }

    // B2. Check for Statistics (NJDG Data) - UPDATED TO USE FILTERED SERVICE
    const isStatsQuery = lower.includes("pending") || lower.includes("case") || lower.includes("stat");
    if (isStatsQuery) {
        const statsAnswer = getJudicialStats(q);
        if (statsAnswer) return { isBasic: true, answer: statsAnswer };
    }

    // C. Intent Detection (Constitution vs BNS)
    const intent = await classifyIntent(q);
    if (intent.dataset !== "all") dataset = intent.dataset;

    // D. IPC Translation
    const ipcMatch = q.match(/ipc\s*(\d+)/i);
    if (ipcMatch && ipcMap[ipcMatch[1]]) {
        const bns = ipcMap[ipcMatch[1]];
        notice = `Note: IPC ${ipcMatch[1]} is now BNS Section ${bns}.`;
        q = `Section ${bns} Bharatiya Nyaya Sanhita`;
    }

    // E. Retrieval (Article/Section or Semantic Search)
    const isDirect = q.match(/\b(section|article|ipc|bns|sec|art)\b/i);
    let hits = [];

    if (isDirect) {
        const num = q.match(/\d+/)?.[0];
        hits = q.includes("art") ? await findByArticle(num) : await findBySection(num);
    } else {
        hits = await search(q, 8, dataset);
    }

    return { isBasic: false, q, hits, notice };
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

app.get("/chat", (req, res) => res.render("chat"));

// --- WEB ENDPOINT ---
app.post("/api/ask", async (req, res) => {
    try {
        const { q: userQ, sessionId = 'default' } = req.body;
        if (!userQ) return res.status(400).json({ error: "Empty query" });

        const result = await processLegalQuery(userQ, req.body.dataset);
        if (result.isBasic) return res.json({ answer: result.answer, sources: [] });

        let history = chatHistory.get(sessionId) || [];
        const messages = [
            { role: "system", content: "You are LawGPT. Use context to answer. Be concise and cite [number]." },
            ...history.slice(-4),
            { role: "user", content: `CONTEXT:\n${result.hits.map((h, i) => `[${i+1}] ${h.text}`).join("\n")}\n\nNotice: ${result.notice}\n\nQuestion: ${result.q}` }
        ];

        const answer = await azureChat(messages, 800);
        
        history.push({ role: "user", content: userQ }, { role: "assistant", content: answer });
        chatHistory.set(sessionId, history.slice(-10));

        res.json({ answer, notice: result.notice, sources: result.hits });
    } catch (e) {
        log(`API Error: ${e.message}`);
        res.status(500).json({ error: "Service unavailable." });
    }
});

// --- TELEGRAM BOT ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.catch((err, ctx) => {
    log(`Bot Error for ${ctx.updateType}: ${err.message}`);
    ctx.reply("I encountered an error. Please try rephrasing your legal query.");
});

bot.on('text', async (ctx) => {
    try {
        const result = await processLegalQuery(ctx.message.text);
        if (result.isBasic) return ctx.reply(result.answer, { parse_mode: 'Markdown' });

        const messages = [{ role: "user", content: `Context: ${result.hits.map(h => h.text).join("\n")}\nQuestion: ${result.q}` }];
        const answer = await azureChat(messages);
        
        const finalResponse = result.notice ? `*${result.notice}*\n\n${answer}` : answer;
        ctx.reply(finalResponse, { parse_mode: 'Markdown' });
    } catch (err) {
        log(`Bot Logic Error: ${err.message}`);
    }
});

// --- SEQUENTIAL STARTUP ---
const start = async () => {
    try {
        await init(); 
        const PORT = CONFIG.port || 3000;
        app.listen(PORT, () => log(`✅ Web Server: port ${PORT}`));
        
        bot.launch()
            .then(() => log("🤖 Telegram Bot: Active"))
            .catch(e => log(`❌ Bot Failed: ${e.message}`));

        // Initialize NJDG Automation
        initStatsCron();

    } catch (err) {
        log(`🛑 Fatal Startup Error: ${err.message}`);
        process.exit(1);
    }
};

start();