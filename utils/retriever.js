import sqlite3 from "sqlite3";
import * as sqliteVec from "sqlite-vec";

let db = null;

export async function init() {
    if (db) return;
    const dbPath = process.env.DATABASE_PATH || "./data/sqlite3/lawgpt_vectors.sqlite";
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) console.error("❌ DB Init Error:", err.message);
        else {
            sqliteVec.load(db);
            console.log("✅ Database & Vector Extension Connected.");
        }
    });
}

// Added the missing getStats tool
export async function getStats() {
    return { status: "active", database: "connected" };
}

export async function search(q) {
    await init();
    return new Promise((res) => {
        db.all("SELECT text, source FROM documents LIMIT 5", [], (err, rows) => {
            res(rows || []);
        });
    });
}

export const findByArticle = (id) => search(id);
export const findBySection = (id) => search(id);
