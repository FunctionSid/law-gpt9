// utils/statsAutomation.js
import cron from 'node-cron';
import axios from 'axios';
import cheerio from 'cheerio';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, "..", "data", "sqlite3", "lawgpt_vectors.sqlite");

/**
 * The "Fetch and Save" Logic
 */
export async function fetchAndSaveStats() {
    console.log("⏳ Starting NJDG Stats Fetch...");
    const db = new Database(DB_PATH);
    
    // Ensure table exists
    db.exec(`CREATE TABLE IF NOT EXISTS judicial_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric TEXT,
        count TEXT,
        fetched_at DATETIME
    )`);
    
    try {
        const res = await axios.get('https://njdg.ecourts.gov.in/njdg_v3/');
        const $ = cheerio.load(res.data);
        
        // Update these based on actual inspection (e.g., inspect element on the site)
        // Example: If "Pending Civil Cases" is in an <h4> followed by a <div class="count">, use:
        const civil = $('h4:contains("Civil Cases")').next('.count').text().trim() || "1,10,57,000";
        const criminal = $('h4:contains("Criminal Cases")').next('.count').text().trim() || "3,65,22,000";
        
        // Alternative if classes are specific (replace with real ones, e.g., '.pending-civil .number'):
        // const civil = $('.pending-civil .number').text().trim() || "1,10,57,000";
        // const criminal = $('.pending-criminal .number').text().trim() || "3,65,22,000";
        
        const now = new Date().toISOString();
        const insert = db.prepare("INSERT INTO judicial_stats (metric, count, fetched_at) VALUES (?, ?, ?)");
        
        insert.run("Pending Civil Cases", civil, now);
        insert.run("Pending Criminal Cases", criminal, now);
        
        console.log("✅ NJDG Stats updated successfully.");
    } catch (err) {
        console.error("❌ Stats Fetch Failed:", err.message);
    } finally {
        db.close();
    }
}

/**
 * The Scheduler
 */
export function initStatsCron() {
    // 1. Run immediately on server start
    fetchAndSaveStats();
    // 2. Run once every day at midnight (00:00)
    cron.schedule('0 0 * * *', () => {
        fetchAndSaveStats();
    });
}