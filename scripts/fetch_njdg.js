import axios from 'axios';
import * as cheerio from 'cheerio';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve paths for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Go up one level to root, then into data/sqlite3
const DB_PATH = path.join(__dirname, '..', 'data', 'sqlite3', 'lawgpt_vectors.sqlite');
const NJDG_URL = "https://njdg.ecourts.gov.in/njdgnew/index.php";

export default async function fetchAndSave() {
    console.log("⏳ [Auto-Fetch] Connecting to NJDG...");

    try {
        const { data: html } = await axios.get(NJDG_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(html);
        const pageText = $('body').text(); 
        
        const parseStat = (label) => {
            const regex = new RegExp(`${label}[^0-9]*([0-9,]+)`, 'i');
            const match = pageText.match(regex);
            return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
        };

        const civil = parseStat("Civil Cases");
        const criminal = parseStat("Criminal Cases");
        const total = parseStat("Total Cases");

        if (total === 0) {
            console.log("⚠️ [Auto-Fetch] Warning: Zero cases found. Layout might have changed.");
            return;
        }

        saveToDB({ civil, criminal, total });

    } catch (err) {
        console.error("❌ [Auto-Fetch] Error:", err.message);
    }
}

function saveToDB(stats) {
    let db;
    try {
        db = new Database(DB_PATH);
        
        db.exec(`
            CREATE TABLE IF NOT EXISTS judicial_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT, 
                metric TEXT, 
                count INTEGER, 
                fetched_at TEXT
            );
        `);

        const insert = db.prepare("INSERT INTO judicial_stats (category, metric, count, fetched_at) VALUES (?, ?, ?, ?)");
        const date = new Date().toISOString();

        const tx = db.transaction(() => {
            insert.run('National', 'Civil Cases', stats.civil, date);
            insert.run('National', 'Criminal Cases', stats.criminal, date);
            insert.run('National', 'Total Pending', stats.total, date);
        });
        tx();

        console.log(`✅ [Auto-Fetch] Success! Total Pending: ${stats.total.toLocaleString()}`);
    } catch (e) {
        console.error("❌ [Auto-Fetch] Database Error:", e.message);
    } finally {
        if (db) db.close();
    }
}