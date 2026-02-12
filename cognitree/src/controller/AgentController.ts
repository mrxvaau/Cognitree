import { Agent } from "../agent/Agent";
import { QwenAgent } from "../agent/QwenAgent";
import { getAgentOutput } from "../output/agentOutput";

let agent: Agent | null = null;

export function startAgent() {
  if (agent) return;

  const output = getAgentOutput();
  agent = new QwenAgent((data: string) => {
    output.append(data);
  });

  agent.start();
  output.show();
}

export function sendPrompt(prompt: string) {
  if (!agent) return;
  agent.send(prompt);
}

export function stopAgent() {
  if (!agent) return;
  agent.stop();
  agent = null;
}
