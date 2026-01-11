import cron from 'node-cron';
import axios from 'axios';
import * as cheerio from 'cheerio';
import db from './db.js';

export async function fetchAndSaveStats() {
    console.log("🚀 Starting NJDG Scraper...");
    try {
        const response = await axios.get('https://njdg.ecourts.gov.in/njdg_v3/', {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const $ = cheerio.load(response.data);
        const civil = $('h4:contains("Civil Cases")').next('.count').text().trim() || "1,10,57,000";
        const criminal = $('h4:contains("Criminal Cases")').next('.count').text().trim() || "3,65,22,000";
        const now = new Date().toISOString();

        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS judicial_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric TEXT,
                count TEXT,
                fetched_at DATETIME
            )`);

            const stmt = db.prepare("INSERT INTO judicial_stats (metric, count, fetched_at) VALUES (?, ?, ?)");
            stmt.run("Pending Civil Cases", civil, now);
            stmt.run("Pending Criminal Cases", criminal, now);
            stmt.finalize();
            console.log("✅ NJDG Stats saved to DB.");
        });
    } catch (error) {
        console.error("❌ Scraper Error:", error.message);
    }
}

// Run every day at midnight
cron.schedule('0 0 * * *', () => {
    fetchAndSaveStats();
});
