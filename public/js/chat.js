// public/js/chat.js
import { speak, startVoiceRecognition } from './voice.js';
import { appendMessage, toggleMicVisuals } from './ui.js';

// DOM Elements
const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const micBtn = document.getElementById('mic-btn');
const chatContainer = document.getElementById('chat-container');

// State variables
let recognitionInstance = null;
let isMicActive = false;

// --- Helper: Show/Hide Loading Animation ---
function showLoading() {
  const id = 'loading-' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.classList.add('message', 'bot');
  div.innerHTML = `<div class="message-content"><em>AI is thinking<span class="dots">...</span></em></div>`;
  
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return id;
}

function removeLoading(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// --- 1. Handle Sending Messages ---
async function handleSubmit() {
  const question = input.value.trim();
  if (!question) return;

  // Show User Message in UI
  appendMessage(question, 'user');
  input.value = '';
  
  const loadingId = showLoading();
  
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // FIX: Ensure we use 'q' to match server.js
      body: JSON.stringify({ q: question }) 
    });
    
    const data = await res.json();
    removeLoading(loadingId);

    // NEW: Handle IPC-to-BNS Notice
    if (data.notice) {
      appendMessage(`⚠️ ${data.notice}`, 'bot-notice'); 
    }

    if (data.error) {
      const errorMsg = data.error.includes("Rate Limit") 
        ? "AI is busy. Looking into law books directly..." 
        : `Error: ${data.error}`;
      
      appendMessage(errorMsg, 'bot');
      if (data.answer) appendMessage(data.answer, 'bot', data.sources);
      speak("System busy.");
    } else {
      // SUCCESS: appendMessage in ui.js handles sources & formatting
      appendMessage(data.answer, 'bot', data.sources);
      
      // Clean up text for Speech (remove stars/markdown)
      const speechText = data.answer.replace(/[*#_]/g, '');
      speak(speechText);
    }
  } catch (err) {
    console.error(err);
    removeLoading(loadingId);
    appendMessage("Network error. Is the server running?", 'bot');
  }
}

// --- 2. Mic Toggle Logic ---
function handleMicToggle() {
  if (isMicActive) {
    if (recognitionInstance) recognitionInstance.stop(); 
  } else {
    toggleMicVisuals(true);
    isMicActive = true;

    recognitionInstance = startVoiceRecognition(
      (transcript) => {
        input.value = transcript;
        // Auto-submit after 1.5 seconds of silence
        setTimeout(() => {
          if (input.value && isMicActive) handleSubmit();
        }, 1500); 
      },
      () => {
        toggleMicVisuals(false);
        isMicActive = false;
        recognitionInstance = null;
      }
    );
  }
}

// --- 3. Event Listeners ---
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSubmit();
  });
}

if (micBtn) {
  micBtn.addEventListener('click', handleMicToggle);
}

// --- 4. Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
  // Ctrl+Enter to send
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (document.activeElement === input) handleSubmit();
  }
  // Alt+A to trigger Mic
  if (e.altKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    handleMicToggle();
  }
  // Escape to stop speech
  if (e.key === 'Escape') {
    window.speechSynthesis.cancel();
  }
});