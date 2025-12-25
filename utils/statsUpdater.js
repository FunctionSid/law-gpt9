// utils/statsUpdater.js
import Database from 'better-sqlite3';

const DB_PATH = "./data/sqlite3/lawgpt_vectors.sqlite";

/**
 * Logic to save fresh stats into the DB
 */
export function updateJudicialStats(civilCount, criminalCount) {
    const db = new Database(DB_PATH);
    const now = new Date().toISOString();

    const insert = db.prepare("INSERT INTO judicial_stats (metric, count, fetched_at) VALUES (?, ?, ?)");
    
    // Save Civil Stats
    insert.run("Pending Civil Cases", civilCount, now);
    // Save Criminal Stats
    insert.run("Pending Criminal Cases", criminalCount, now);
    
    db.close();
    console.log("✅ Judicial Stats updated in database.");
}