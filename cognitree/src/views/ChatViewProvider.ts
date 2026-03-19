import * as vscode from 'vscode';

export class ChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'cognitree.chatView';

	private _view?: vscode.WebviewView;

	constructor(private readonly _extensionUri: vscode.Uri) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'sendMessage':
					if (data.value) {
						// Forward to the agent controller
						vscode.commands.executeCommand('cognitree.sendMessage', data.value);
					}
					break;
				case 'ready':
					// Send any initial messages or status updates
					break;
			}
		});
	}

	public sendMessage(message: string, sender: 'user' | 'agent', isStreaming: boolean = false) {
		if (this._view) {
			this._view.webview.postMessage({
				type: 'receiveMessage',
				message: message,
				sender: sender,
				isStreaming: isStreaming
			});
		}
	}

	public endStream() {
		if (this._view) {
			this._view.webview.postMessage({
				type: 'endStream'
			});
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Point to where the TS file will be compiled: out/views/chatView.js
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'out', 'views', 'chatView.js')
		);

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Cognitree Chat</title>
				<style>
					body, html {
						height: 100%;
						margin: 0;
						padding: 0;
						overflow: hidden;
						font-family: var(--vscode-editor-font-family);
						font-size: var(--vscode-editor-font-size);
					}
					
					#chat-container {
						display: flex;
						flex-direction: column;
						height: 100%;
						background-color: var(--vscode-editor-background);
					}
					
					#messages {
						flex: 1;
						overflow-y: auto;
						padding: 10px;
						display: flex;
						flex-direction: column;
						gap: 10px;
					}
					
					.message {
						padding: 10px 14px;
						border-radius: 8px;
						max-width: 85%;
						word-wrap: break-word;
						line-height: 1.5;
					}
					
					.user-message {
						align-self: flex-end;
						background-color: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
					}
					
					.agent-message {
						align-self: flex-start;
						background-color: var(--vscode-editor-inactiveSelectionBackground);
						color: var(--vscode-editor-foreground);
					}

					/* Markdown Styles */
					.agent-message pre {
						background-color: var(--vscode-textBlockQuote-background);
						padding: 10px;
						border-radius: 4px;
						overflow-x: auto;
						margin: 5px 0;
					}

					.agent-message code {
						font-family: var(--vscode-editor-font-family);
					}
					
					.agent-message .inline-code {
						background-color: var(--vscode-textBlockQuote-background);
						padding: 2px 4px;
						border-radius: 3px;
					}

					.agent-message h1, .agent-message h2, .agent-message h3 {
						margin-top: 10px;
						margin-bottom: 5px;
						font-weight: 600;
					}
					
					#input-container {
						display: flex;
						padding: 10px;
						gap: 8px;
						background-color: var(--vscode-sideBar-background);
						border-top: 1px solid var(--vscode-panel-border);
					}
					
					#message-input {
						flex: 1;
						padding: 10px;
						border: 1px solid var(--vscode-input-border);
						border-radius: 4px;
						background-color: var(--vscode-input-background);
						color: var(--vscode-input-foreground);
						font-family: inherit;
					}
					
					#message-input:focus {
						outline: 1px solid var(--vscode-focusBorder);
						border-color: var(--vscode-focusBorder);
					}
					
					#send-button {
						padding: 8px 16px;
						background-color: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
						border: none;
						border-radius: 4px;
						cursor: pointer;
						font-weight: 500;
					}
					
					#send-button:hover {
						background-color: var(--vscode-button-hoverBackground);
					}
				</style>
			</head>
			<body>
				<div id="chat-container">
					<div id="messages"></div>
					<div id="input-container">
						<input type="text" id="message-input" placeholder="Type your message to Qwen..." autocomplete="off">
						<button id="send-button">Send</button>
					</div>
				</div>
				<script src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}