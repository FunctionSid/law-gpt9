import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import healthRoutes from "./routes/healthRoutes.js";
import { init } from "./utils/retriever.js";

// WAKE UP TELEGRAM BOT
import "./bots/telegram.js"; 

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 8080;

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => res.status(200).send("OK"));
app.use("/health", healthRoutes);

app.get("/", (req, res) => {
    res.render("chat", (err, html) => {
        if (err) return res.status(500).send("Website View Error: " + err.message);
        res.send(html);
    });
});

app.listen(port, () => {
    console.log(`🚀 Website live on port ${port}`);
    console.log(`🤖 Telegram Bot is starting...`);
    init().then(() => console.log("✅ Database Ready.")).catch(e => console.log("❌ DB Error"));
});
