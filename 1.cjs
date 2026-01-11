// check_db.cjs
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

console.log("--- LawGPT Database Diagnostic ---");

// 1. Check Database File
const dbPath = path.resolve(__dirname, 'data', 'sqlite3', 'lawgpt_vectors.sqlite');
if (fs.existsSync(dbPath)) {
    console.log("✅ File Found: data/sqlite3/lawgpt_vectors.sqlite");
} else {
    console.log("❌ File Missing: Could not find the database file.");
}

// 2. Try to Connect and Load Vector Engine
try {
    const db = new Database(dbPath);
    
    // We try to load the Windows version for your local D: drive
    const extPath = path.resolve(__dirname, 'node_modules', 'sqlite-vec-windows-x64', 'vec0.dll');
    
    if (fs.existsSync(extPath)) {
        db.loadExtension(extPath);
        console.log("✅ Vector Engine: Loaded successfully (vec0)");
        
        // 3. Count the Laws
        const count = db.prepare("SELECT COUNT(*) as total FROM documents").get();
        console.log(`📊 Laws Found: ${count.total} chunks of Indian Law are ready.`);
        
        // 4. Test Search Module
        db.prepare("SELECT vec_version()").get();
        console.log("✅ Search Check: The AI can search this database.");
        
    } else {
        console.log("❌ Extension Missing: Could not find vec0.dll in node_modules.");
    }
    
    db.close();
} catch (err) {
    console.log("❌ Database Error: " + err.message);
}

console.log("----------------------------------");