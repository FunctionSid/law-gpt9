import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import healthRoutes from "./routes/healthRoutes.js";
import { init } from "./utils/retriever.js";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

// IMPORTANT: Connect the health check for Azure
app.use("/health", healthRoutes);
app.get("/", (req, res) => res.render("chat"));

app.listen(port, async () => {
    console.log(`🚀 Server live on port ${port}`);
    // Initialize database after the server starts
    try {
        await init();
        console.log("✅ Database Ready.");
    } catch (err) {
        console.log("❌ DB Error: " + err.message);
    }
});
