import * as vscode from "vscode";
import { startAgent, sendPrompt, stopAgent, isAgentRunning, setChatViewProvider } from "./controller/AgentController";
import { CognitreePanel } from "./ui/CognitreePanel";
import { Logger } from "./utils/logger";
import { QwenIntegrationService } from "./services/QwenIntegrationService";
import { ChatViewProvider } from "./views/ChatViewProvider";

let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  console.log("Cognitree extension activation started.");

  try {
    // 1. Register ChatViewProvider IMMEDIATELY
    // This ensures the view is registered before any other initialization logic runs.
    console.log("Registering ChatViewProvider...");
    const chatViewProvider = new ChatViewProvider(context.extensionUri);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider("cognitree.chatView", chatViewProvider)
    );
    console.log("ChatViewProvider registered successfully.");

    // Set the chat view provider in the agent controller
    setChatViewProvider(chatViewProvider);

    // 2. Initialize other components
    // Initialize output channel
    outputChannel = vscode.window.createOutputChannel("Cognitree");

    // Initialize logger
    const logger = Logger.getInstance();
    logger.info("Cognitree extension activated");

    // Initialize integration service
    const integrationService = QwenIntegrationService.getInstance();

    // 3. Register commands
    const startCmd = vscode.commands.registerCommand(
      "cognitree.start",
      () => {
        if (isAgentRunning()) {
          vscode.window.showInformationMessage("Cognitree agent is already running!");
          return;
        }
        startAgent();
        vscode.window.showInformationMessage("Cognitree started");
      }
    );

    const sendCmd = vscode.commands.registerCommand(
      "cognitree.send",
      async () => {
        if (!isAgentRunning()) {
          const result = await vscode.window.showWarningMessage(
            "Cognitree agent is not running. Would you like to start it?",
            "Yes", "No"
          );

          if (result === "Yes") {
            startAgent();
          } else {
            return;
          }
        }

        const input = await vscode.window.showInputBox({
          prompt: "Send a message to Cognitree"
        });

        if (input) {
          sendPrompt(input);
        }
      }
    );

    const sendMessageCmd = vscode.commands.registerCommand(
      "cognitree.sendMessage",
      async (message: string) => {
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

        sendPrompt(message);
      }
    );

    const stopCmd = vscode.commands.registerCommand(
      "cognitree.stop",
      () => {
        if (!isAgentRunning()) {
          vscode.window.showInformationMessage("Cognitree agent is not running");
          return;
        }
        stopAgent();
        vscode.window.showInformationMessage("Cognitree stopped");
      }
    );

    const panelCmd = vscode.commands.registerCommand(
      "cognitree.panel",
      () => {
        CognitreePanel.createOrShow(context.extensionUri);
      }
    );

    const logsCmd = vscode.commands.registerCommand(
      "cognitree.logs",
      () => {
        Logger.getInstance().show();
      }
    );

    const sendSelectionCmd = vscode.commands.registerCommand(
      "cognitree.sendSelection",
      async () => {
        await integrationService.sendSelectionToAgent();
      }
    );

    const sendFileCmd = vscode.commands.registerCommand(
      "cognitree.sendFile",
      async () => {
        await integrationService.sendFileToAgent();
      }
    );

    const generateCodeCmd = vscode.commands.registerCommand(
      "cognitree.generateCode",
      async () => {
        const prompt = await vscode.window.showInputBox({
          prompt: "Enter a description of the code you want to generate"
        });

        if (prompt) {
          await integrationService.generateCode(prompt);
        }
      }
    );

    const fixCodeCmd = vscode.commands.registerCommand(
      "cognitree.fixCode",
      async () => {
        await integrationService.fixCode();
      }
    );

    // Register all commands with the context
    context.subscriptions.push(
      startCmd,
      sendCmd,
      sendMessageCmd,
      stopCmd,
      panelCmd,
      logsCmd,
      sendSelectionCmd,
      sendFileCmd,
      generateCodeCmd,
      fixCodeCmd
    );

    // 4. Auto-start if configured
    const config = vscode.workspace.getConfiguration('cognitree');
    if (config.get<boolean>('autoStart')) {
      logger.info("Auto-start enabled, starting agent");
      startAgent();
    }

  } catch (err) {
    console.error("Cognitree activation failed:", err);
    vscode.window.showErrorMessage(`Cognitree activation failed: ${err}`);
  }
}

export function deactivate() {
  const logger = Logger.getInstance();
  logger.info("Cognitree extension deactivating");

  if (isAgentRunning()) {
    stopAgent();
  }
  outputChannel.dispose();
  logger.info("Cognitree extension deactivated");
}
