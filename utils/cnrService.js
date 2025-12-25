import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, "..", "data", "sqlite3", "lawgpt_vectors.sqlite");

/**
 * Checks a 16-digit CNR number and returns case status.
 */
export function searchByCNR(cnrNumber) {
    const cleanCNR = cnrNumber.trim().toUpperCase();
    
    // Basic validation for 16 alphanumeric characters
    if (!/^[A-Z0-9]{16}$/.test(cleanCNR)) {
        return "Please provide a valid 16-digit alphanumeric CNR number.";
    }

    const db = new Database(DB_PATH);
    try {
        const caseData = db.prepare("SELECT * FROM case_tracking WHERE cnr = ?").get(cleanCNR);
        
        if (!caseData) {
            return `No records found for CNR: ${cleanCNR}. Please verify the number on the eCourts portal.`;
        }

        return `📌 **Case Status for ${cleanCNR}:**\n- **Petitioner:** ${caseData.petitioner}\n- **Respondent:** ${caseData.respondent}\n- **Next Hearing:** ${caseData.next_date}\n- **Stage:** ${caseData.stage}`;
    } catch (err) {
        return "Error accessing case records.";
    } finally {
        db.close();
    }
}