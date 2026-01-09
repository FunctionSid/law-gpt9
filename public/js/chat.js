const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const hfStatus = document.getElementById('hf-status');

// --- NEW: Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
    // ESC Key: Stop TTS immediately
    if (e.key === 'Escape') {
        window.speechSynthesis.cancel();
    }
});

userInput.addEventListener('keydown', (e) => {
    // Ctrl + Enter: Send message
    if (e.ctrlKey && e.key === 'Enter') {
        handleSend();
    }
});

// --- EXISTING: Voice & Hands-Free Logic ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-IN';

    // Mic Button Click
    micBtn.addEventListener('click', () => {
        window.speechSynthesis.cancel();
        recognition.start();
        hfStatus.textContent = "Listening...";
    });

    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        
        // Voice Commands
        if (transcript.includes('stop') || transcript.includes('pause')) {
            window.speechSynthesis.cancel();
            return;
        }
        if (transcript.includes('resume')) {
            window.speechSynthesis.resume();
            return;
        }

        // Send voice to chat
        userInput.value = transcript;
        handleSend();
    };
}

// --- EXISTING: Chat Handling ---
async function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage('You', text);
    userInput.value = '';

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const data = await response.json();
        addMessage('Bot', data.reply);
        speak(data.reply);
    } catch (err) {
        addMessage('System', 'Error: AI connection failed.');
    }
}

sendBtn.addEventListener('click', handleSend);

function speak(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    window.speechSynthesis.speak(utterance);
}

function addMessage(sender, text) {
    const div = document.createElement('div');
    div.className = 'msg';
    div.innerHTML = `<strong>${sender}:</strong> ${text}`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}