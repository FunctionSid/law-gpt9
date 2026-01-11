import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { init } from "./utils/retriever.js";
import "./bots/telegram.js"; 

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Use Port 3000 to match your Azure settings
const port = process.env.PORT || 3000;

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => res.status(200).send("Healthy"));
app.get("/", (req, res) => res.render("chat"));

app.listen(port, () => {
    console.log(`🚀 Website live on port ${port}`);
    console.log(`🤖 Telegram Bot is starting...`);
    init().then(() => console.log("✅ Database Ready.")).catch(e => console.log("❌ DB Error"));
});
