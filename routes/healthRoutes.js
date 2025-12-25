// routes/healthRoutes.js
import express from "express";
import { init, getStats } from "../utils/retriever.js";
import { checkAzure } from "../utils/azureClient.js";

const router = express.Router();

router.get("/health", async (_req, res) => {
  try {
    await init();
    const stats = getStats();
    const azure = await checkAzure();
    res.json({
      status: "ok",
      embeddings_loaded: true,
      azure_connected: azure.ok,
      azure_endpoint: azure.endpoint,
      db_stats: stats,
    });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

export default router;
