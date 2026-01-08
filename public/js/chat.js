import { speak, startHandsFree } from './voice.js';
import { appendMessage } from './ui.js';

const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const hfToggle = document.getElementById('hf-toggle');
let hfInstance = null;

async function handleSubmit(text) {
    const q = text || input.value;
    if (!q) return;
    appendMessage(q, 'user');
    input.value = '';
    const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q }) });
    const data = await res.json();
    if (data.notice) appendMessage(data.notice, 'bot');
    appendMessage(data.answer, 'bot', data.sources);
    speak(data.answer);
}

hfToggle.addEventListener('change', () => {
    if (hfToggle.checked) {
        hfInstance = startHandsFree(
            () => {
                // Flash the input or provide a sound hint
                input.placeholder = "Listening...";
                speak("Ready Siddharth.");
            }, 
            (cmd) => handleSubmit(cmd)
        );
    } else if (hfInstance) {
        hfInstance.stop();
        input.placeholder = "Type a legal question...";
    }
});

form.addEventListener('submit', (e) => { e.preventDefault(); handleSubmit(); });
