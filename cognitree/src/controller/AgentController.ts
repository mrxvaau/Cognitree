import { Agent } from "../agent/Agent";
import { QwenAgent } from "../agent/QwenAgent";
import { getAgentOutput } from "../output/agentOutput";
import { CognitreePanel } from "../ui/CognitreePanel";
import { Logger } from "../utils/logger";
import * as vscode from "vscode";

let agent: Agent | null = null;
// Removed top-level logger initialization to prevent side-effects during module load

// Global reference to the chat view provider to send messages to it
let chatViewProvider: any = null;

export function setChatViewProvider(provider: any) {
  chatViewProvider = provider;
}

export function startAgent() {
  const logger = Logger.getInstance();
  logger.info("Attempting to start Cognitree agent");

  if (agent) {
    const output = getAgentOutput();
    const msg = "Cognitree agent is already running.\n";
    output.append(msg);
    CognitreePanel.appendOutput(msg);
    if (chatViewProvider) {
      chatViewProvider.sendMessage(msg.trim(), 'agent');
    }
    output.show();
    logger.warn("Agent already running, ignoring start request");
    return;
  }

  const output = getAgentOutput();
  agent = new QwenAgent(
    (data: string) => {
      output.append(data);
      CognitreePanel.appendOutput(data);
      if (chatViewProvider) {
        // Send as streaming message
        chatViewProvider.sendMessage(data, 'agent', true);
      }
      logger.info(`Agent output received: ${data.substring(0, 100)}...`);
    },
    (error: Error) => {
      const errorMsg = `Error: ${error.message}\n`;
      output.append(errorMsg);
      CognitreePanel.appendOutput(errorMsg);
      if (chatViewProvider) {
        chatViewProvider.sendMessage(errorMsg, 'agent');
      }
      Logger.getInstance().error("Agent error occurred", error);
      vscode.window.showErrorMessage(`Cognitree Error: ${error.message}`);
    }
  );

  agent.start();
  output.show();
  logger.info("Agent start command issued");
}

export function sendPrompt(prompt: string) {
  const logger = Logger.getInstance();
  logger.info(`Sending prompt to agent: ${prompt.substring(0, 50)}...`);

  if (!agent) {
    const output = getAgentOutput();
    const errorMsg = "Error: Cognitree agent is not running. Please start the agent first.\n";
    output.append(errorMsg);
    CognitreePanel.appendOutput(errorMsg);
    if (chatViewProvider) {
      chatViewProvider.sendMessage(errorMsg, 'agent');
    }
    logger.warn("Attempted to send prompt when agent is not running");
    vscode.window.showWarningMessage("Cognitree agent is not running. Please start the agent first.");
    return;
  }

  // Send user message to chat view
  if (chatViewProvider) {
    chatViewProvider.sendMessage(prompt, 'user');
    // Signal start of new stream potentially? 
    // Actually, the client handles 'agent' messages as appending, so 'user' message breaks the stream naturally.
  }

  agent.send(prompt);
}

export function stopAgent() {
  const logger = Logger.getInstance();
  logger.info("Attempting to stop Cognitree agent");

  if (!agent) {
    const output = getAgentOutput();
    const msg = "Cognitree agent was not running.\n";
    output.append(msg);
    CognitreePanel.appendOutput(msg);
    if (chatViewProvider) {
      chatViewProvider.sendMessage(msg.trim(), 'agent');
    }
    logger.warn("Attempted to stop agent when not running");
    return;
  }
  agent.stop();
  agent = null;
  logger.info("Agent stopped successfully");
}

export function isAgentRunning(): boolean {
  const running = agent !== null && (agent as QwenAgent).isRunning();
  Logger.getInstance().info(`Agent running status checked: ${running}`);
  return running;
}
