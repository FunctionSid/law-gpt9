export function speak(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#_]/g, '').replace(/\[\d+\]/g, ''));
    const voices = window.speechSynthesis.getVoices();
    const saved = localStorage.getItem('preferredVoice');
    if (saved !== null && voices[saved]) utterance.voice = voices[saved];
    else utterance.lang = 'en-IN';
    
    // Track if we are currently speaking
    window.isLawGPTSpeaking = true;
    utterance.onend = () => { window.isLawGPTSpeaking = false; };
    
    window.speechSynthesis.speak(utterance);
}

export function startHandsFree(onWake, onCommand) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRec();
    rec.lang = 'en-IN';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (e) => {
        const text = e.results[e.results.length - 1][0].transcript.toLowerCase();
        
        // Check for immediate commands first (Stop/Pause/Resume)
        if (text.includes("stop") || text.includes("cancel")) {
            window.speechSynthesis.cancel();
            return;
        }
        if (text.includes("pause")) {
            window.speechSynthesis.pause();
            return;
        }
        if (text.includes("resume")) {
            window.speechSynthesis.resume();
            return;
        }

        // Check for Wake Word to ask a new question
        if (text.includes("hey law gpt")) {
            // If AI is talking, stop it so we can hear the new question
            window.speechSynthesis.cancel();
            onWake();
        } else {
            onCommand(text);
        }
    };

    rec.onerror = () => { rec.start(); }; // Restart if it stops
    rec.start();
    return rec;
}
