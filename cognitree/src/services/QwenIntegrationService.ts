import * as vscode from 'vscode';
import { startAgent, sendPrompt, isAgentRunning } from '../controller/AgentController';

export class QwenIntegrationService {
    private static instance: QwenIntegrationService;

    private constructor() {}

    public static getInstance(): QwenIntegrationService {
        if (!QwenIntegrationService.instance) {
            QwenIntegrationService.instance = new QwenIntegrationService();
        }
        return QwenIntegrationService.instance;
    }

    /**
     * Sends the current selection to the Qwen agent
     */
    public async sendSelectionToAgent(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found.');
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage('No text selected to send to agent.');
            return;
        }

        const selectedText = editor.document.getText(selection);
        const fileName = editor.document.fileName.split('\\').pop()?.split('/').pop() || 'unknown';
        const prompt = `File: ${fileName}\nSelected code:\n${selectedText}\n\nPlease analyze this code and provide suggestions or improvements.`;

        await this.sendPromptToAgent(prompt);
    }

    /**
     * Sends the entire current file to the Qwen agent
     */
    public async sendFileToAgent(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found.');
            return;
        }

        const fileName = editor.document.fileName.split('\\').pop()?.split('/').pop() || 'unknown';
        const fullText = editor.document.getText();
        const prompt = `File: ${fileName}\nFull file content:\n${fullText}\n\nPlease analyze this file and provide suggestions or improvements.`;

        await this.sendPromptToAgent(prompt);
    }

    /**
     * Sends a custom prompt with context from the current file
     */
    public async sendPromptWithContext(prompt: string): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            // Just send the prompt without context if no editor is active
            await this.sendPromptToAgent(prompt);
            return;
        }

        const fileName = editor.document.fileName.split('\\').pop()?.split('/').pop() || 'unknown';
        const selection = editor.selection;
        let contextText = '';

        if (!selection.isEmpty) {
            // Use selected text as context
            contextText = editor.document.getText(selection);
            contextText = `\nCurrent selection from ${fileName}:\n${contextText}`;
        } else {
            // Use visible range as context
            const visibleRange = editor.visibleRanges[0];
            if (visibleRange) {
                contextText = editor.document.getText(visibleRange);
                contextText = `\nVisible context from ${fileName}:\n${contextText}`;
            }
        }

        const fullPrompt = `${prompt}${contextText}`;
        await this.sendPromptToAgent(fullPrompt);
    }

    /**
     * Generate code based on a prompt
     */
    public async generateCode(prompt: string): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found to insert generated code.');
            return;
        }

        const fileName = editor.document.fileName.split('\\').pop()?.split('/').pop() || 'unknown';
        const language = editor.document.languageId;
        const context = editor.document.getText(editor.selection.isEmpty ?
            new vscode.Range(0, 0, Math.min(10, editor.document.lineCount), 0) :
            editor.selection);

        const fullPrompt = `Generate code in ${language} language.\nContext from ${fileName}: ${context}\n\n${prompt}`;

        await this.sendPromptToAgent(fullPrompt);
    }

    /**
     * Fixes the selected code based on agent suggestions
     */
    public async fixCode(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found.');
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage('No text selected to fix.');
            return;
        }

        const selectedText = editor.document.getText(selection);
        const fileName = editor.document.fileName.split('\\').pop()?.split('/').pop() || 'unknown';
        const language = editor.document.languageId;
        const prompt = `Fix or improve the following ${language} code from ${fileName}:\n${selectedText}`;

        await this.sendPromptToAgent(prompt);
    }

    private async sendPromptToAgent(prompt: string): Promise<void> {
        // Check if agent is running, start if not
        if (!isAgentRunning()) {
            const result = await vscode.window.showWarningMessage(
                "Cognitree agent is not running. Would you like to start it?",
                "Yes", "No"
            );

            if (result === "Yes") {
                startAgent();

                // Wait a bit for the agent to start
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                return;
            }
        }

        sendPrompt(prompt);
    }
}