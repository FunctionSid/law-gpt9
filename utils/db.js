import sqlite3 from "sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, "../data/sqlite3/lawgpt_vectors.sqlite");
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Database Error:", err.message);
    else {
        console.log("Connected to SQLite.");
        sqliteVec.load(db);
        console.log("Vector Extension Active.");
    }
});
export const all = (sql, params = []) => new Promise((res, rej) => {
    db.all(sql, params, (err, rows) => err ? rej(err) : res(rows));
});
export default db;
