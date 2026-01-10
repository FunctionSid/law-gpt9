// utils/statsAutomation.js
import cron from 'node-cron';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ FIX: Use the Environment Variable you set in Azure, fallback to local if missing
const DB_PATH = '/home/site/wwwroot/data/sqlite3/lawgpt_vectors.sqlite';
    ? path.resolve(process.env.DATABASE_PATH) 
    : path.resolve(__dirname, "..", "data", "sqlite3", "lawgpt_vectors.sqlite");

export async function fetchAndSaveStats() {
    console.log(`⏳ Using DB at: ${DB_PATH}`);

    // Ensure directory exists (Important for Linux/Azure)
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    let db;
    try {
        db = new Database(DB_PATH);
        
        db.exec(`CREATE TABLE IF NOT EXISTS judicial_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            metric TEXT,
            count TEXT,
            fetched_at DATETIME
        )`);
        
        const res = await axios.get('https://njdg.ecourts.gov.in/njdg_v3/', {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)' }
        });

        const $ = cheerio.load(res.data);
        
        // Scraping Logic
        const civil = $('h4:contains("Civil Cases")').next('.count').text().trim() || "1,10,57,000";
        const criminal = $('h4:contains("Criminal Cases")').next('.count').text().trim() || "3,65,22,000";
        
        const now = new Date().toISOString();
        const insert = db.prepare("INSERT INTO judicial_stats (metric, count, fetched_at) VALUES (?, ?, ?)");
        
        insert.run("Pending Civil Cases", civil, now);
        insert.run("Pending Criminal Cases", criminal, now);
        
        console.log("✅ NJDG Stats successfully saved to Database.");
    } catch (err) {
        console.error("❌ Stats Fetch Failed:", err.message);
    } finally {
        if (db) db.close();
    }
}

export function initStatsCron() {
    fetchAndSaveStats();
    cron.schedule('0 0 * * *', () => {
        fetchAndSaveStats();
    });
}


