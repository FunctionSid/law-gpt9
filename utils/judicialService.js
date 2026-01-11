import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '..', 'data', 'sqlite3', 'lawgpt_vectors.sqlite');

/**
 * Formats numbers into the Indian numbering system (e.g., 1,10,57,023)
 */
function formatIndianNumber(numStr) {
    const num = parseFloat(numStr.replace(/,/g, ''));
    if (isNaN(num)) return numStr;
    return new Intl.NumberFormat('en-IN').format(num);
}

/**
 * Queries the database for specific pending case stats.
 */
export function getJudicialStats(userQuery) {
    const lower = userQuery.toLowerCase();
    const db = new Database(DB_PATH);
    
    try {
        let sql = "SELECT * FROM judicial_stats";
        let params = [];

        // Filter based on the specific type of case requested
        if (lower.includes("civil")) {
            sql += " WHERE metric LIKE ?";
            params.push("%Civil%");
        } else if (lower.includes("criminal")) {
            sql += " WHERE metric LIKE ?";
            params.push("%Criminal%");
        }

        const stats = db.prepare(sql + " ORDER BY fetched_at DESC LIMIT 2").all(...params);
        if (stats.length === 0) return null;

        const dateString = new Date(stats[0].fetched_at).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric'
        });

        const statsList = stats.map(s => {
            const accessibleNum = formatIndianNumber(s.count);
            return `${s.metric}: **${accessibleNum}**`;
        }).join(", ");

        return `As of ${dateString}, the records show: ${statsList}.`;
    } catch (err) {
        console.error(`Stats Service Error: ${err.message}`);
        return null;
    } finally {
        db.close();
    }
}

