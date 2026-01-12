import sqlite3 from "sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function getDbConnection() {
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "../data/sqlite3/lawgpt_vectors.sqlite");
    const db = new sqlite3.Database(dbPath);

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // SMART LOADING: Detect OS and find the right vec0 file
            const isLinux = process.platform === "linux";
            const extFolder = isLinux ? "sqlite-vec-linux-x64" : "sqlite-vec-windows-x64";
            const extFile = isLinux ? "vec0.so" : "vec0.dll";
            
            // Look in node_modules for the extension
            const extensionPath = path.join(__dirname, "..", "node_modules", extFolder, extFile);

            db.loadExtension(extensionPath, (err) => {
                if (err) {
                    console.error("❌ Failed to load vector extension:", err.message);
                    // Try fallback to standard load if path fails
                    sqliteVec.load(db); 
                } else {
                    console.log("✅ Vector extension loaded from:", extensionPath);
                }
                resolve(db);
            });
        });
    });
}
