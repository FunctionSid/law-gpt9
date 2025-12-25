import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";
import { Telegraf } from "telegraf";

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ Error: Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const API_URL = "http://localhost:3000/api/ask";
const MAX_TG_CHARS = 4000; // Safe limit for Telegram

const bot = new Telegraf(BOT_TOKEN);

// --- Helper: Clean Source Labels ---
function cleanSourceLabel(src) {
    if (src.article) return `Article ${src.article}`;
    if (src.section) return `Section ${src.section}`;
    let name = src.source.replace(/_/g, ' ').replace('.txt', '');
    if (name.includes("constitution")) return "Constitution of India";
    if (name.includes("bharatiya")) return "BNS (2023)";
    return name;
}

// --- Helper: Split Long Messages (Safety) ---
function splitMessage(text) {
    const chunks = [];
    while (text.length > MAX_TG_CHARS) {
        // Find the last space within the limit to avoid cutting words
        let chunkEnd = text.lastIndexOf(' ', MAX_TG_CHARS);
        if (chunkEnd === -1) chunkEnd = MAX_TG_CHARS; // No spaces? Cut arbitrarily
        
        chunks.push(text.slice(0, chunkEnd));
        text = text.slice(chunkEnd).trim();
    }
    chunks.push(text);
    return chunks;
}

// --- Commands ---
bot.start((ctx) => {
    ctx.reply(
        "⚖️ *Namaste! I am LawGPT.*\n\n" +
        "I am smart enough to know which law book to check.\n" +
        "Just ask me naturally:\n\n" +
        "🔹 _What is Article 21?_\n" +
        "🔹 _Punishment for theft in BNS?_\n",
        { parse_mode: "Markdown" }
    );
});

// --- Message Handler ---
bot.on("text", async (ctx) => {
    const userQ = ctx.message.text;
    ctx.sendChatAction("typing");

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q: userQ })
        });

        const data = await res.json();

        if (data.error) {
            return ctx.reply("⚠️ " + data.error);
        }

        let replyText = data.answer;

        // Add Professional Source Citations
        if (data.sources && data.sources.length > 0) {
            replyText += "\n\n📚 *References:*";
            const uniqueRefs = new Set();
            data.sources.forEach(src => uniqueRefs.add(cleanSourceLabel(src)));
            uniqueRefs.forEach(ref => replyText += `\n• ${ref}`);
        }

        // Send (Split if too long)
        const messages = splitMessage(replyText);
        for (const msg of messages) {
            await ctx.reply(msg, { parse_mode: "Markdown" });
        }

    } catch (err) {
        console.error("Bot Error:", err.message);
        ctx.reply("❌ Sorry, I am having trouble connecting to the server.");
    }
});

// --- Launch ---
bot.launch().then(() => console.log("🤖 Professional Telegram Bot is running..."));

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));