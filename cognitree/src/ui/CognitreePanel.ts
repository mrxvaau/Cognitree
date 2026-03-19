import * as vscode from 'vscode';

export class CognitreePanel {
	private static readonly viewType = 'cognitree.panel';
	private static panel: vscode.WebviewPanel | undefined;
	private static readonly _onDidDispose = new vscode.EventEmitter<void>();
	public static readonly onDidDispose = CognitreePanel._onDidDispose.event;

	public static createOrShow(extensionUri: vscode.Uri) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		if (CognitreePanel.panel) {
			CognitreePanel.panel.reveal(column);
			return;
		}

		CognitreePanel.panel = vscode.window.createWebviewPanel(
			CognitreePanel.viewType,
			'Cognitree',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(extensionUri, 'media'),
					vscode.Uri.joinPath(extensionUri, 'out'),
				],
			}
		);

		CognitreePanel.panel.webview.html = CognitreePanel.getWebviewContent(CognitreePanel.panel.webview, extensionUri);

		CognitreePanel.panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'sendPrompt':
						// Forward the message to the extension
						vscode.commands.executeCommand('cognitree.send', message.text);
						break;
				}
			}
		);

		CognitreePanel.panel.onDidDispose(() => {
			CognitreePanel.dispose();
		}, null, []);
	}

	public static appendOutput(text: string) {
		if (CognitreePanel.panel) {
			CognitreePanel.panel.webview.postMessage({
				command: 'appendOutput',
				text: text
			});
		}
	}

	public static dispose() {
		if (CognitreePanel.panel) {
			CognitreePanel.panel.dispose();
			CognitreePanel.panel = undefined;
		}

		CognitreePanel._onDidDispose.fire();
		CognitreePanel._onDidDispose.dispose();
	}

	private static getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'ui.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'ui.css'));

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Cognitree</title>
				<link href="${styleUri}" rel="stylesheet">
			</head>
			<body>
				<div class="container">
					<h1>Cognitree Agent</h1>
					<div id="output" class="output-panel"></div>
					<div class="input-container">
						<input type="text" id="prompt-input" placeholder="Enter your prompt here...">
						<button id="send-btn">Send</button>
						<button id="clear-btn">Clear</button>
					</div>
				</div>
				<script src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}