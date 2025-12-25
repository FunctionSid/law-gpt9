import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..datasqlite3lawgpt_vectors.sqlite');


  Fetches specific judicial stats based on user keywords.
  @param {string} query - The user's question (e.g., how many civil cases)
 
export function getFilteredStats(query) {
    const db = new Database(dbPath);
    const lowerQuery = query.toLowerCase();
    let results = [];

    try {
         1. Determine if we are looking for Civil or Criminal
        let sql = SELECT metric, count, fetched_at FROM judicial_stats;
        let params = [];

        if (lowerQuery.includes(civil)) {
            sql +=  WHERE metric LIKE ;
            params.push('%Civil%');
        } else if (lowerQuery.includes(criminal)) {
            sql +=  WHERE metric LIKE ;
            params.push('%Criminal%');
        }

         2. Get the latest data for those metrics
        const rows = db.prepare(sql +  ORDER BY fetched_at DESC LIMIT 2).all(...params);

        if (rows.length === 0) return No pending case data found in the database.;

         3. Format the response nicely
        const date = new Date(rows[0].fetched_at).toLocaleDateString();
        const statsString = rows.map(r = `${r.metric} ${r.count}`).join(, );
        
        return `As of ${date}, the records show ${statsString}.`;

    } catch (error) {
        console.error(Stats Helper Error, error.message);
        return Sorry, I couldn't retrieve the judicial statistics right now.;
    } finally {
        db.close();
    }
}