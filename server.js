import express from "express";
import dotenv from "dotenv";
import { init } from "./utils/retriever.js";

console.log("📍 [TRACE 1] Script is starting...");
dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

console.log("📍 [TRACE 2] Settings loaded. Setting up routes...");

app.get("/health", (req, res) => {
    console.log("📍 [TRACE 5] Azure Health Check pinged the bot.");
    res.status(200).send("Healthy");
});

app.get("/", (req, res) => {
    res.send("<h1>Law GPT is Online</h1>");
});

app.listen(port, async () => {
    console.log(`📍 [TRACE 3] Server is now listening on port ${port}`);
    try {
        console.log("📍 [TRACE 4] Calling Database Init...");
        await init();
        console.log("✅ [SUCCESS] Bot is fully ready!");
    } catch (err) {
        console.error("❌ [ERROR] Crash during Database Init:", err.message);
    }
});
