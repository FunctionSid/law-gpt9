import dotenv from 'dotenv';
import { AzureOpenAI } from 'openai';

dotenv.config();

// Check for missing keys immediately
if (!process.env.AZURE_OPENAI_API_KEY || !process.env.AZURE_OPENAI_ENDPOINT) {
  console.error("❌ CRITICAL ERROR: Missing Azure API Key or Endpoint in .env");
  process.exit(1);
}

// Create ONE shared client for the whole app
export const azureClient = new AzureOpenAI({
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-06-01",
  deployment: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT 
});

export const CONFIG = {
  chatModel: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
  embedModel: process.env.AZURE_OPENAI_EMBED_DEPLOYMENT,
  port: process.env.PORT || 3000,
  dbPath: './data/sqlite3/lawgpt_vectors.sqlite'
};