export function speak(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#_]/g, '').replace(/\[\d+\]/g, ''));
    const voices = window.speechSynthesis.getVoices();
    const saved = localStorage.getItem('preferredVoice');
    if (saved !== null && voices[saved]) utterance.voice = voices[saved];
    else utterance.lang = 'en-IN';
    window.speechSynthesis.speak(utterance);
}
export function startHandsFree(onWake, onCommand) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRec(); rec.lang = 'en-IN'; rec.continuous = true;
    rec.onresult = (e) => {
        const text = e.results[e.results.length - 1][0].transcript.toLowerCase();
        if (text.includes("hey law gpt")) onWake();
        else if (text.includes("stop")) window.speechSynthesis.cancel();
        else if (text.includes("pause")) window.speechSynthesis.pause();
        else if (text.includes("resume")) window.speechSynthesis.resume();
        else onCommand(text);
    };
    rec.start(); return rec;
}
