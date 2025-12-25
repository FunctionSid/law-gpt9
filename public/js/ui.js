// public/js/ui.js
const chatContainer = document.getElementById('chat-container');
const micBtn = document.getElementById('mic-btn');

// Helper to scroll chat to the bottom
export function scrollToBottom() {
    if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Helper to add messages to the screen
export function appendMessage(text, sender, sources = []) {
    const msgDiv = document.createElement('div');
    // 'sender' can now be 'user', 'bot', or 'bot-notice'
    msgDiv.classList.add('message', sender);
    
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    
    // Format bot messages AND legal notices
    if (sender === 'bot' || sender === 'bot-notice') {
        // Simple Markdown parsing: **Bold** and newlines
        let formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
        contentDiv.innerHTML = formatted;
    } else {
        contentDiv.textContent = text;
    }
    
    msgDiv.appendChild(contentDiv);

    // Add Sources if they exist (Citation badges)
    if (sources && sources.length > 0) {
        const sourcesDiv = document.createElement('div');
        sourcesDiv.classList.add('sources-container');
        sourcesDiv.innerHTML = `<small><strong>Sources:</strong></small>`;
        
        sources.forEach(src => {
            const badge = document.createElement('span');
            badge.className = 'source-badge';
            // Logic to handle 'section', 'article', or 'page'
            const ref = src.section_number || src.article || src.section || '';
            const details = ref ? `| Ref: ${ref}` : (src.page ? `| pg ${src.page}` : '');
            badge.textContent = `${src.source} ${details}`;
            sourcesDiv.appendChild(badge);
        });
        
        msgDiv.appendChild(sourcesDiv);
    }

    chatContainer.appendChild(msgDiv);
    scrollToBottom();
}

// Helper to change Mic button visuals
export function toggleMicVisuals(isListening) {
    if (!micBtn) return;
    
    if (isListening) {
        micBtn.classList.add('listening');
        micBtn.innerHTML = '🛑'; // Stop Icon
        micBtn.style.backgroundColor = '#ff4444'; // Red for recording
    } else {
        micBtn.classList.remove('listening');
        micBtn.innerHTML = '🎤'; // Mic Icon
        micBtn.style.backgroundColor = ''; // Reset to default
    }
}