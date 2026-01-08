// scripts/add_new_laws.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdf from 'pdf-parse';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Database Path for Test Branch
const DB_FILE = path.resolve(__dirname, "..", "data/sqlite3/lawgpt_vectors.sqlite");
const db = new Database(DB_FILE);

// 2. Your PDF files from the Downloads folder
const newLaws = [
    { 
        name: "DPDP Act 2023", 
        path: "C:/Users/Sourabh/Downloads/Digital Personal Data Protection Act, 2023.pdf",
        label: "dpdp_act_2023"
    },
    { 
        name: "Disability Rights Act 2016", 
        path: "C:/Users/Sourabh/Downloads/the_rights_of_persons_with_disabilities_act,_2016.pdf",
        label: "disability_rights_2016"
    }
];

async function processPDFs() {
    console.log("🚀 Starting to add new laws to Test DB...");

    for (const law of newLaws) {
        try {
            console.log(`\nReading PDF: ${law.name}`);
            const dataBuffer = fs.readFileSync(law.path);
            const pdfData = await pdf(dataBuffer);
            const text = pdfData.text;

            // Chunking: 1400 characters with 200 overlap
            const chunks = [];
            for (let i = 0; i < text.length; i += 1200) {
                chunks.push(text.slice(i, i + 1400));
            }

            console.log(`✅ ${chunks.length} chunks found. Starting Azure Embeddings...`);

            for (let i = 0; i < chunks.length; i++) {
                const chunkText = chunks[i];
                
                // Call Azure OpenAI for the numbers (embeddings)
                const response = await fetch(`${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${process.env.AZURE_OPENAI_EMBED_DEPLOYMENT}/embeddings?api-version=${process.env.AZURE_OPENAI_API_VERSION}`, {
                    method: "POST",
                    headers: { 
                        "api-key": process.env.AZURE_OPENAI_API_KEY, 
                        "content-type": "application/json" 
                    },
                    body: JSON.stringify({ input: chunkText }),
                });

                const result = await response.json();
                
                if (!result.data) {
                    console.error("\n❌ Azure Error:", result);
                    continue;
                }

                const embedding = result.data[0].embedding;
                const vectorBuffer = Buffer.from(new Float32Array(embedding).buffer);

                // Save Text and Source Label
                const insertDoc = db.prepare("INSERT INTO documents (text, source) VALUES (?, ?)");
                const docInfo = insertDoc.run(chunkText, law.label);
                
                // Save Search Numbers (Vectors)
                const insertVec = db.prepare("INSERT INTO vectors (rowid, embedding) VALUES (?, ?)");
                insertVec.run(docInfo.lastInsertRowid, vectorBuffer);

                process.stdout.write(`Progress: ${i + 1}/${chunks.length}\r`);
            }
            console.log(`\n🎉 Successfully added ${law.name}!`);
        } catch (err) {
            console.error(`❌ Error with ${law.name}:`, err.message);
        }
    }
    db.close();
    console.log("\n✅ All done. Database updated.");
}

processPDFs();