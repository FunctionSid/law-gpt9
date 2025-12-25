// public/js/voice.js

// 1. Text-to-Speech (Bot Speaks)
export function speak(text) {
    if ('speechSynthesis' in window) {
        // Stop any current speech immediately
        window.speechSynthesis.cancel();

        // Refined cleaning: Remove markdown and citation brackets for smoother audio
        const cleanText = text
            .replace(/[*#_`]/g, '')        // Remove Markdown
            .replace(/\[\d+\]/g, '')       // Remove citation numbers like [1], [2]
            .replace(/\s+/g, ' ')          // Collapse extra spaces
            .trim();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        
        // Settings for a professional legal assistant tone
        utterance.lang = 'en-IN'; // Indian English
        utterance.rate = 1.0;     // 1.0 is normal human speed
        utterance.pitch = 1.0;

        window.speechSynthesis.speak(utterance);
    }
}

// 2. Speech-to-Text (Mic Input)
export function startVoiceRecognition(onResultCallback, onEndCallback) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        alert("Voice input is not supported in this browser. Please use Chrome or Edge.");
        if (onEndCallback) onEndCallback();
        return null;
    }

    // INTERRUPT: Stop the bot from speaking as soon as the user starts their mic
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; 
    recognition.interimResults = false; // Set to true if you want to see text as you speak
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        console.log("Listening for legal query...");
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (onResultCallback) onResultCallback(transcript);
    };

    recognition.onerror = (event) => {
        // Handle common errors like 'no-speech' or 'audio-capture'
        console.warn("Speech recognition error:", event.error);
        if (onEndCallback) onEndCallback();
    };

    recognition.onend = () => {
        if (onEndCallback) onEndCallback();
    };

    try {
        recognition.start();
    } catch (e) {
        console.error("Recognition start failed:", e);
    }

    return recognition;
}