export interface Agent {
    start(): void;
    send(prompt: string): void;
    stop(): void;
  }
  