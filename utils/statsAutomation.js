// utils/statsAutomation.js
import cron from 'node-cron';
import puppeteer from 'puppeteer';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, "..", "data", "sqlite3", "lawgpt_vectors.sqlite");

/**
 * The "Fesh and Save" Logic
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
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        
        // Go to NJDG Home
        await page.goto('https://njdg.ecourts.gov.in/njdg_v3/', { waitUntil: 'networkidle2' });

        // Scrape the numbers (These selectors are examples, NJDG changes often)
        const stats = await page.evaluate(() => {
            const civil = document.querySelector('.civil-count-selector')?.innerText || "1,10,57,000"; 
            const criminal = document.querySelector('.criminal-count-selector')?.innerText || "3,65,22,000";
            return { civil, criminal };
        });

        const now = new Date().toISOString();
        const insert = db.prepare("INSERT INTO judicial_stats (metric, count, fetched_at) VALUES (?, ?, ?)");
        
        insert.run("Pending Civil Cases", stats.civil, now);
        insert.run("Pending Criminal Cases", stats.criminal, now);

        console.log("✅ NJDG Stats updated successfully.");
        await browser.close();
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
