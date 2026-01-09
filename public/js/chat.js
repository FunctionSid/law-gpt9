const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const hfStatus = document.getElementById('hf-status');
let isHandsFreeOn = false;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.speechSynthesis.cancel(); });
userInput.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'Enter') handleSend(); });
const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
let recognition;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-IN';
    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        if (transcript.includes('stop')) { window.speechSynthesis.cancel(); return; }
        if (isHandsFreeOn && transcript.includes('hey law gpt')) {
            const q = transcript.replace('hey law gpt', '').trim();
            if (q) { userInput.value = q; handleSend(); }
        }
    };
    recognition.onend = () => { if (isHandsFreeOn) recognition.start(); };
}
micBtn.addEventListener('click', () => {
    if (!isHandsFreeOn) {
        recognition.start();
        isHandsFreeOn = true;
        hfStatus.textContent = "Hands-Free Mode: ON (Say: Hey LawGPT)";
        micBtn.style.backgroundColor = "#ff4444";
        micBtn.setAttribute('aria-label', 'Stop Hands Free Mode');
    } else {
        recognition.stop();
        isHandsFreeOn = false;
        hfStatus.textContent = "Hands-Free Mode: OFF";
        micBtn.style.backgroundColor = "#166534";
        micBtn.setAttribute('aria-label', 'Start Hands Free Mode');
    }
});
async function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;
    addMessage('You', text);
    userInput.value = '';
    try {
        const response = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text }) });
        const data = await response.json();
        const reply = data.answer || data.reply || "Processing...";
        addMessage('Bot', reply);
        speak(reply);
    } catch (err) { addMessage('System', 'Error: AI connection failed.'); }
}
sendBtn.addEventListener('click', handleSend);
function speak(t) { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'en-IN'; window.speechSynthesis.speak(u); }
function addMessage(s, t) {
    const d = document.createElement('div'); d.className = 'msg';
    d.innerHTML = '<strong>' + s + ':</strong> ' + t;
    chatBox.appendChild(d); chatBox.scrollTop = chatBox.scrollHeight;
}
