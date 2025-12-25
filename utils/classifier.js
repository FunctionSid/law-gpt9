// utils/classifier.js

function normalizeText(s) {
    return (s || "").toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

const SMALL_TALK_KEYWORDS = [
    "who are you", "what is your name", "who created you", "how are you", 
    "hello", "hi", "hey", "thanks", "thank you", "bye"
];

// --- The function server.js is looking for ---
export async function classifyIntent(query) {
    const norm = normalizeText(query);
    
    // 1. Detect Small Talk (Instant local response)
    const isSmallTalk = SMALL_TALK_KEYWORDS.some(k => norm.includes(k));
    if (isSmallTalk) {
        return { 
            label: "small_talk", 
            dataset: "all", 
            isSmallTalk: true 
        };
    }

    // 2. Detect Dataset Intent
    let dataset = "all";
    let label = "general";

    if (norm.match(/\b(constitution|article|art|fundamental rights|preamble)\b/i)) {
        dataset = "constitution_of_india";
        label = "constitutional";
    } else if (norm.match(/\b(murder|theft|bns|punishment|ipc|crime|jail|offence)\b/i)) {
        dataset = "bharatiya_nyaya_sanhita";
        label = "criminal";
    }

    return { label, dataset, isSmallTalk: false };
}