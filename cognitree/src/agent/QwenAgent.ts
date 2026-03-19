import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { Agent } from "./Agent";
import * as vscode from "vscode";
import { Logger } from "../utils/logger";

export class QwenAgent implements Agent {
  private process: ChildProcessWithoutNullStreams | null = null;
  private onOutput: (data: string) => void;
  private onError: (error: Error) => void;
  private config: vscode.WorkspaceConfiguration;
  private logger: Logger;

  constructor(
    onOutput: (data: string) => void,
    onError: (error: Error) => void
  ) {
    this.onOutput = onOutput;
    this.onError = onError;
    this.config = vscode.workspace.getConfiguration('cognitree');
    this.logger = Logger.getInstance();
  }

  start(): void {
    this.logger.info("Starting Qwen agent");

    if (this.process) {
      const msg = "Qwen agent is already running.\n";
      this.onOutput(msg);
      this.logger.warn("Attempted to start agent when already running");
      return;
    }

    const qwenPath = this.config.get<string>('qwenPath', 'qwen');
    this.logger.info(`Using Qwen CLI at path: ${qwenPath}`);

    try {
      // Check if qwen command exists
      this.logger.info("Checking if Qwen CLI is available");
      this.process = spawn(qwenPath, ["--version"], {
        shell: true
      });

      this.process.stdout.on("data", (data) => {
        this.logger.info(`Qwen CLI version check output: ${data.toString().trim()}`);
        // If version check succeeds, start the actual agent
        this.process?.kill(); // Kill the version check process
        this.launchAgent();
      });

      this.process.stderr.on("data", (data) => {
        const errorStr = data.toString();
        this.logger.error(`Qwen CLI version check error: ${errorStr}`);
        if (errorStr.toLowerCase().includes("command not found") ||
            errorStr.toLowerCase().includes("'qwen' is not recognized")) {
          const error = new Error(`Qwen CLI is not installed or not found at path: ${qwenPath}. Please install Qwen CLI or check the path in settings.`);
          this.onError(error);
          this.process = null;
        }
      });

      this.process.on("error", (err) => {
        this.logger.error(`Failed to launch Qwen CLI at path '${qwenPath}'`, err);
        this.onError(new Error(`Failed to launch Qwen CLI at path '${qwenPath}': ${err.message}`));
        this.process = null;
      });

      // Set a timeout for version check based on configuration
      const timeout = this.config.get<number>('timeout', 30000);
      this.logger.info(`Setting timeout for version check: ${timeout}ms`);
      setTimeout(() => {
        if (this.process) {
          this.logger.warn("Version check timed out, proceeding with agent launch");
          this.process.kill();
          this.launchAgent(); // Assume qwen exists if version check takes too long
        }
      }, timeout);

    } catch (error) {
      this.logger.error("Exception during agent startup", error as Error);
      this.onError(error instanceof Error ? error : new Error(String(error)));
      this.process = null;
    }
  }

  private launchAgent(): void {
    const qwenPath = this.config.get<string>('qwenPath', 'qwen');
    this.logger.info(`Launching Qwen agent with command: ${qwenPath} code`);

    try {
      this.process = spawn(qwenPath, ["code"], {
        shell: true,
        env: { ...process.env } // Pass current environment
      });

      this.process.stdout.on("data", (data) => {
        this.logger.info(`Agent output: ${data.toString().substring(0, 100)}...`);
        this.onOutput(data.toString());
      });

      this.process.stderr.on("data", (data) => {
        this.logger.error(`Agent error output: ${data.toString().substring(0, 100)}...`);
        this.onOutput(data.toString()); // Also send stderr to output
      });

      this.process.stdin.setDefaultEncoding('utf-8');

      this.process.on("error", (err) => {
        this.logger.error("Agent process error", err);
        this.onError(new Error(`Agent process error: ${err.message}`));
        this.process = null;
      });

      this.process.on("exit", (code, signal) => {
        if (code !== null) {
          this.logger.info(`Qwen agent exited with code: ${code}`);
          this.onOutput(`Qwen agent exited with code: ${code}\n`);
        } else if (signal) {
          this.logger.info(`Qwen agent terminated by signal: ${signal}`);
          this.onOutput(`Qwen agent terminated by signal: ${signal}\n`);
        }
        this.process = null;
      });

      this.logger.info("Qwen agent launched successfully");
    } catch (error) {
      this.logger.error("Exception during agent launch", error as Error);
      this.onError(error instanceof Error ? error : new Error(String(error)));
      this.process = null;
    }
  }

  send(prompt: string): void {
    if (!this.process) {
      const error = new Error("Qwen agent is not running. Please start the agent first.");
      this.logger.error("Attempted to send prompt when agent is not running");
      this.onError(error);
      return;
    }

    try {
      if (this.process.stdin.writable) {
        this.logger.info(`Sending prompt to agent: ${prompt.substring(0, 50)}...`);
        this.process.stdin.write(prompt + "\n");
      } else {
        const error = new Error("Cannot send message: agent input stream is not writable");
        this.logger.error("Agent input stream not writable");
        this.onError(error);
      }
    } catch (error) {
      this.logger.error("Exception during prompt sending", error as Error);
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  stop(): void {
    if (this.process) {
      try {
        this.logger.info("Stopping Qwen agent");
        this.process.kill();
        this.onOutput("Qwen agent stopped.\n");
      } catch (error) {
        this.logger.error("Exception during agent stop", error as Error);
        this.onError(error instanceof Error ? error : new Error(String(error)));
      }
    } else {
      this.logger.warn("Attempted to stop agent when not running");
      this.onOutput("Qwen agent was not running.\n");
    }
    this.process = null;
  }

  isRunning(): boolean {
    const running = this.process !== null;
    this.logger.info(`Agent running status: ${running}`);
    return running;
  }
}
