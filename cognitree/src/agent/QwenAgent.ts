import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { Agent } from "./Agent";

export class QwenAgent implements Agent {
  private process: ChildProcessWithoutNullStreams | null = null;
  private onOutput: (data: string) => void;

  constructor(onOutput: (data: string) => void) {
    this.onOutput = onOutput;
  }

  start(): void {
    if (this.process) return;

    this.process = spawn("qwen", ["code"], {
      shell: true
    });

    this.process.stdout.on("data", (data) => {
      this.onOutput(data.toString());
    });

    this.process.stderr.on("data", (data) => {
      this.onOutput(data.toString());
    });

    this.process.on("exit", () => {
      this.process = null;
    });
  }

  send(prompt: string): void {
    if (!this.process) return;
    this.process.stdin.write(prompt + "\n");
  }

  stop(): void {
    this.process?.kill();
    this.process = null;
  }
}
