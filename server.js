import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Telegraf } from 'telegraf';

// --- UTILITY IMPORTS ---
import { CONFIG } from "./config.js";
import { ipcMap } from "./utils/ipc_map.js";
import { classifyIntent } from "./utils/classifier.js";
import { azureChat } from "./utils/azureClient.js";
import { getBasicResponse } from "./utils/basicResponses.js";
import { init, search, findByArticle, findBySection } from "./utils/retriever.js";
import { initStatsCron } from "./utils/statsAutomation.js";
import { getJudicialStats } from "./utils/judicialService.js";
import { searchByCNR } from "./utils/cnrService.js";

// --- ALEXA ROUTER IMPORT ---
import alexaRouter from "./routes/alexa.js";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- LOGGING SYSTEM ---
const LOG_FILE = path.join(__dirname, 'server.log');
function log(message) {
    const logLine = `[${new Date().toLocaleTimeString()}] ${message}`;
    console.log(logLine);
    try {
        fs.appendFileSync(LOG_FILE, logLine + '\n');
    } catch (err) { /* silent fail */ }
}

// --- SHARED QUERY PROCESSOR ---
export async function processLegalQuery(userQuery, requestedDataset) {
    let q = userQuery.trim();
    let lower = q.toLowerCase();
    let dataset = requestedDataset || "all";
    let notice = "";

    const basic = getBasicResponse(q);
    if (basic) return { isBasic: true, answer: basic };

    const cnrMatch = q.match(/[A-Z0-9]{16}/i);
    if (cnrMatch) {
        const cnrResult = searchByCNR(cnrMatch[0]);
        return { isBasic: true, answer: cnrResult };
    }

    const isStatsQuery = lower.includes("pending") || lower.includes("case") || lower.includes("stat");
    if (isStatsQuery) {
        const statsAnswer = getJudicialStats(q);
        if (statsAnswer) return { isBasic: true, answer: statsAnswer };
    }

    const ipcMatch = q.match(/ipc\s*(\d+)/i);
    if (ipcMatch && ipcMap[ipcMatch[1]]) {
        const bns = ipcMap[ipcMatch[1]];
        notice = `Note: IPC ${ipcMatch[1]} is now BNS Section ${bns}.`;
        q = `Section ${bns} Bharatiya Nyaya Sanhita`;
    }

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

// --- EXPRESS APP SETUP ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

// --- WEB ROUTES ---
app.get("/", (req, res) => res.send("Law-GPT Test Server is Active"));
app.get("/chat", (req, res) => res.render("chat"));

// --- NEW: ROUTE FOR ABOUT PAGE ---
app.get("/about", (req, res) => res.render("about"));

// --- ALEXA DOORWAY ---
app.use("/alexa", alexaRouter);

// --- WEB API ENDPOINT ---
app.post("/api/ask", async (req, res) => {
    try {
        const { q: userQ } = req.body;
        if (!userQ) return res.status(400).json({ error: "Empty query" });

        const result = await processLegalQuery(userQ, req.body.dataset);
        if (result.isBasic) return res.json({ answer: result.answer, sources: [] });

        const messages = [
            { role: "system", content: "You are LawGPT. Use context to answer clearly in grade-8 English. Cite sources as [1], [2]." },
            { role: "user", content: `CONTEXT:\n${result.hits.map((h, i) => `[${i+1}] ${h.text}`).join("\n")}\n\nQuestion: ${result.q}` }
        ];

        const answer = await azureChat(messages, 800);
        res.json({ answer, notice: result.notice, sources: result.hits });
    } catch (e) {
        log(`API Error: ${e.message}`);
        res.status(500).json({ error: "Service unavailable." });
    }
});

// --- TELEGRAM BOT (DISABLED FOR TEST BRANCH) ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.on('text', async (ctx) => {
    try {
        const result = await processLegalQuery(ctx.message.text);
        if (result.isBasic) return ctx.reply(result.answer);

        const messages = [{ role: "user", content: `Context: ${result.hits.map(h => h.text).join("\n")}\nQuestion: ${result.q}` }];
        const answer = await azureChat(messages);
        
        const responseText = result.notice ? `*${result.notice}*\n\n${answer}` : answer;
        ctx.reply(responseText, { parse_mode: 'Markdown' });
    } catch (err) {
        log(`Telegram Bot Error: ${err.message}`);
    }
});

// --- STARTUP SEQUENCE ---
const start = async () => {
    try {
        await init(); 
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => log(`✅ Web Server: port ${PORT}`));
        
        // --- TELEGRAM DISABLED FOR TEST BRANCH ---
        // bot.launch()
        //     .then(() => log("🤖 Telegram Bot: Active"))
        //     .catch(e => log(`❌ Telegram Bot Failed: ${e.message}`));
        
        log("ℹ️ Telegram Bot launch is paused on the test branch.");

        initStatsCron();
    } catch (err) {
        log(`🛑 Fatal Startup Error: ${err.message}`);
        process.exit(1);
    }
};

start();