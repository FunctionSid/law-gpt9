// bots/telegram.js
import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";
import { Telegraf } from "telegraf";

// load .env from project root explicitly
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const API_URL = process.env.LEGAL_BOT_API_URL || "http://localhost:3000/api/ask";

const MAX_TG = 4096;      // Telegram max
const SAFE_CHUNK = 3800;  // headroom for labels

const chatPrefs = new Map(); // chatId -> { dataset }

function getDataset(chatId) {
  const pref = chatPrefs.get(chatId);
  return pref?.dataset || "constitution_of_india_text";
}
function setDataset(chatId, ds) {
  chatPrefs.set(chatId, { dataset: ds });
}

function splitText(text, chunkSize = SAFE_CHUNK) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + chunkSize));
    i += chunkSize;
  }
  return out;
}

function formatSources(sources = []) {
  if (!sources?.length) return "";
  const lines = sources.slice(0, 5).map((s, i) => {
    const bits = [];
    if (s.source) bits.push(s.source);
    if (s.article != null) bits.push(`Article ${s.article}`);
    if (s.section_number != null) bits.push(`Section ${s.section_number}`);
    return `${i + 1}. ${bits.join(" | ")}`;
  });
  return `\n\nSources:\n${lines.join("\n")}`;
}

const bot = new Telegraf(BOT_TOKEN);

// commands
bot.start(ctx => {
  setDataset(ctx.chat.id, "constitution_of_india_text");
  return ctx.reply(
    "Namaste! I’m the Accessible Legal Chat Bot.\n" +
    "Ask me Indian law questions.\n\n" +
    "Commands:\n" +
    "/constitution – use Constitution of India\n" +
    "/bns – use Bharatiya Nyaya Sanhita, 2023\n" +
    "/dataset – show current dataset"
  );
});

bot.command("dataset", ctx => {
  const ds = getDataset(ctx.chat.id);
  const label = ds.startsWith("bharatiya") ? "BNS (Bharatiya Nyaya Sanhita, 2023)" : "Constitution of India";
  return ctx.reply(`Current dataset: ${label}`);
});

bot.command("constitution", ctx => {
  setDataset(ctx.chat.id, "constitution_of_india_text");
  return ctx.reply("Dataset set to: Constitution of India.");
});

bot.command("bns", ctx => {
  setDataset(ctx.chat.id, "bharatiya_nyaya_sanhita_2023");
  return ctx.reply("Dataset set to: Bharatiya Nyaya Sanhita, 2023.");
});

// main text handler
bot.on("text", async ctx => {
  const chatId = ctx.chat.id;
  const q = (ctx.message.text || "").trim();
  if (!q) return ctx.reply("Please type a question.");

  // quick identity response (also handled by API)
  const lower = q.toLowerCase();
  if (["who made you", "what are you", "who are you"].some(p => lower.includes(p))) {
    return ctx.reply("I was created by Siddharth Kalantri from Bhiwandi, who gave me the power to make Indian law easier to understand.");
  }

  const dataset = getDataset(chatId);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q, dataset })
    });

    let data = null;
    try { data = await res.json(); } catch {}

    if (!res.ok || !data) {
      const msg = `Error from API (${res.status}): ${data?.error || res.statusText || "Unknown error"}`;
      return ctx.reply(msg);
    }

    const answer = (data.answer || data.note || "(no answer)").trim();
    const suffix = formatSources(data.sources);
    const full = answer + suffix;

    if (full.length <= MAX_TG) {
      return ctx.reply(full, { disable_web_page_preview: true });
    }

    // split long replies
    const parts = splitText(full);
    for (const p of parts) {
      // eslint-disable-next-line no-await-in-loop
      await ctx.reply(p, { disable_web_page_preview: true });
    }
  } catch (e) {
    return ctx.reply(`Network error: ${e.message}`);
  }
});

bot.catch(err => console.error("Bot error:", err));

// start long polling
bot.launch().then(() => console.log("Telegram bot started (long polling)."));

// graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
