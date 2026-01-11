import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { init } from "./utils/retriever.js";

// TELEGRAM IS PAUSED (Commented out to prevent 409 Conflict)
// import "./bots/telegram.js"; 

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Using Port 8080 to match Azure Linux
const port = process.env.PORT || 8080;

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Main Route - All your chat features are here
app.get("/", (req, res) => {
    res.render("chat", { title: "LawGPT - Indian Legal Assistant" });
});

app.get("/health", (req, res) => res.status(200).send("Healthy"));

app.listen(port, () => {
    console.log(`🚀 Website live on port ${port}`);
    console.log(`💤 Telegram Bot is currently dormant.`);
    init().then(() => console.log("✅ Database Ready.")).catch(e => console.log("❌ DB Error"));
});
