// @ts-nocheck
declare function acquireVsCodeApi(): any;

// Basic Markdown Parser for the webview
function parseMarkdown(text: any) {
    // Strip ANSI codes
    text = text.replace(new RegExp('[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[a-zA-Z\\d]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))', 'g'), '');

    // 1. Code Blocks
    // Handle ```lang ... ```
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, function (match, lang, code) {
        return `<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`;
    });

    // Handle inline code `...`
    text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // 2. Headers
    text = text.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gm, '<h1>$1</h1>');

    // 3. Lists
    text = text.replace(/^\s*-\s+(.*$)/gm, '<li>$1</li>');
    // Wrap consecutive lis in ul (simple approach)
    text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>'); // Very basic, might need improvement for multiple lists

    // 4. Bold and Italic
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 5. Paragraphs (newlines to <br> or <p>)
    // For simple chat, newlines to <br> is often enough, but let's try p
    text = text.replace(/\n/g, '<br>');

    return text;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

(function () {
    const vscode = acquireVsCodeApi();
    const messagesContainer = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');

    // State for streaming
    let currentAgentMessageDiv = null;
    let currentAgentMessageContent = "";

    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function addMessage(message, sender, isStreaming = false) {
        // If we are streaming and it's an agent message and we have an active div
        if (isStreaming && sender === 'agent' && currentAgentMessageDiv) {
            currentAgentMessageContent += message;
            currentAgentMessageDiv.innerHTML = parseMarkdown(currentAgentMessageContent);
            scrollToBottom();
            return;
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;

        if (sender === 'agent') {
            currentAgentMessageDiv = messageDiv;
            currentAgentMessageContent = message;
            messageDiv.innerHTML = parseMarkdown(message);
        } else {
            messageDiv.textContent = message;
            // Reset streaming state when user sends a message
            currentAgentMessageDiv = null;
            currentAgentMessageContent = "";
        }

        messagesContainer.appendChild(messageDiv);
        scrollToBottom();
    }

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'receiveMessage':
                addMessage(message.message, message.sender, message.isStreaming);
                break;
            case 'endStream':
                currentAgentMessageDiv = null;
                currentAgentMessageContent = "";
                break;
        }
    });

    function sendMessage() {
        const text = messageInput.value;
        if (text) {
            addMessage(text, 'user'); // Optimistically update UI
            vscode.postMessage({ type: 'sendMessage', value: text });
            messageInput.value = '';

            // Prepare for agent response
            currentAgentMessageDiv = null;
            currentAgentMessageContent = "";
        }
    }

    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Focus input on load
    messageInput.focus();
})();
