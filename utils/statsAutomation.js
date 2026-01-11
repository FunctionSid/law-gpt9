import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use the environment variable if it exists, otherwise use the local path
const DB_PATH = process.env.DATABASE_PATH || path.resolve(__dirname, '..', 'data', 'sqlite3', 'lawgpt_vectors.sqlite');

export async function scrapeNJDG() {
    console.log("🔍 Checking for database at:", DB_PATH);
    if (!fs.existsSync(DB_PATH)) {
        console.error("❌ Database file not found at:", DB_PATH);
        return;
    }
    // Rest of your scraper logic...
}
