import sqlite3 from "sqlite3";
import * as sqliteVec from "sqlite-vec";
import { azureClient, CONFIG } from "../config.js";

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

export async function search(q) {
    await init();
    // Simplified search logic for standard sqlite3
    return new Promise((res) => {
        db.all("SELECT d.text, d.source FROM documents d LIMIT 5", [], (err, rows) => {
            res(rows || []);
        });
    });
}

export const findByArticle = (id) => search(id);
export const findBySection = (id) => search(id);
