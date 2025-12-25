// utils/ipc_map.js

// Rename to ipcMap to match server.js imports
export const ipcMap = {
    // --- 1. Crimes Against Human Body ---
    "302": "103",   // Murder (Punishment) - Correct: BNS 103
    "307": "109",   // Attempt to Murder
    "304": "105",   // Culpable Homicide
    "304a": "106",  // Death by Negligence
    "304b": "80",   // Dowry Death
    "306": "108",   // Abetment of Suicide
    "420": "318",   // Cheating (The famous "420" is now 318)
    "376": "64",    // Rape
    "498a": "85",   // Cruelty by Husband
    "499": "356",   // Defamation
    "500": "356",   // Defamation Punishment
    
    // Keywords for new specific offences
    "snatching": "304",
    "mob lynching": "103",
    "organized crime": "111",
    "terrorism": "113",
    "false promise": "69"
};