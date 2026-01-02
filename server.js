
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Telegraf } from "telegraf";
import { init, search } from "./utils/retriever.js";
import { initStatsCron } from "./utils/statsAutomation.js";
import alexaRouter from "./routes/alexa.js";
import chatRouter from "./routes/chatRoutes.js";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

app.use("/alexa", alexaRouter);
app.use("/", chatRouter); 

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.on("text", async (ctx) => {
    try {
        const hits = await search(ctx.message.text);
        ctx.reply(`I found ${hits.length} relevant law sections.`);
    } catch (err) {
        console.error("Bot Error:", err.message);
    }
});

const start = async () => {
    try {
        await init(); 
        initStatsCron();
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => console.log(`✅ LawGPT Test Bed Active on port ${PORT}`));
        bot.launch();
    } catch (err) {
        console.error(`🛑 Startup Error: ${err.message}`);
    }
};
start();
