import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Telegraf } from 'telegraf';
import { CONFIG } from "./config.js";
import { ipcMap } from "./utils/ipc_map.js";
import { classifyIntent } from "./utils/classifier.js";
import { azureChat } from "./utils/azureClient.js";
import { getBasicResponse } from "./utils/basicResponses.js";
import { init, search, findByArticle, findBySection } from "./utils/retriever.js";
import { initStatsCron } from "./utils/statsAutomation.js";
import { getJudicialStats } from "./utils/judicialService.js";
import { searchByCNR } from "./utils/cnrService.js";
import alexaRouter from "./routes/alexa.js";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logging Logic (Kept as is)
const LOG_FILE = path.join(__dirname, 'server.log');
function log(message) {
    const logLine = `[${new Date().toLocaleTimeString()}] ${message}`;
    console.log(logLine);
    try { fs.appendFileSync(LOG_FILE, logLine + '\n'); } catch (err) {}
}

// Legal Query Logic (Kept as is)
export async function processLegalQuery(userQuery, requestedDataset) {
    let q = userQuery.trim();
    let lower = q.toLowerCase();
    let dataset = requestedDataset || "all";
    let notice = "";
    const basic = getBasicResponse(q);
    if (basic) return { isBasic: true, answer: basic };
    const cnrMatch = q.match(/[A-Z0-9]{16}/i);
    if (cnrMatch) return { isBasic: true, answer: searchByCNR(cnrMatch[0]) };
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
    let hits = isDirect ? (q.includes("art") ? await findByArticle(q.match(/\d+/)?.[0]) : await findBySection(q.match(/\d+/)?.[0])) : await search(q, 8, dataset);
    return { isBasic: false, q, hits, notice };
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

// FIXED ROUTES: Connecting buttons to about.ejs
app.get("/", (req, res) => res.render("chat"));
app.get("/chat", (req, res) => res.render("chat"));
app.get("/about", (req, res) => res.render("about"));
app.get("/help", (req, res) => res.render("about"));
app.use("/alexa", alexaRouter);

// API Logic (Kept as is)
app.post("/api/ask", async (req, res) => {
    try {
        const { q: userQ } = req.body;
        if (!userQ) return res.status(400).json({ error: "Empty query" });
        const result = await processLegalQuery(userQ, req.body.dataset);
        if (result.isBasic) return res.json({ answer: result.answer, sources: [] });
        const messages = [
            { role: "system", content: "You are LawGPT. Cite sources as [1], [2]." },
            { role: "user", content: `CONTEXT:\n${result.hits.map((h, i) => `[${i+1}] ${h.text}`).join("\n")}\n\nQuestion: ${result.q}` }
        ];
        const answer = await azureChat(messages, 800);
        res.json({ answer, notice: result.notice, sources: result.hits });
    } catch (e) { log(`API Error: ${e.message}`); res.status(500).json({ error: "Service unavailable." }); }
});

// Telegram Bot (Kept as is)
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.on('text', async (ctx) => {
    try {
        const result = await processLegalQuery(ctx.message.text);
        if (result.isBasic) return ctx.reply(result.answer);
        const messages = [{ role: "user", content: `Context: ${result.hits.map(h => h.text).join("\n")}\nQuestion: ${result.q}` }];
        const answer = await azureChat(messages);
        ctx.reply(result.notice ? `*${result.notice}*\n\n${answer}` : answer, { parse_mode: 'Markdown' });
    } catch (err) { log(`Telegram Bot Error: ${err.message}`); }
});

// Startup Logic (Kept as is)
const start = async () => {
    try {
        await init();
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => log(`✅ Web Server: port ${PORT}`));
        initStatsCron();
    } catch (err) { log(`🛑 Fatal Startup Error: ${err.message}`); process.exit(1); }
};
start();
