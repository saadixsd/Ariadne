export type HandoffInput = {
  agentName: string;
  taskTitle: string;
  output: string;
};

export function handoffBlock(input: HandoffInput): string {
  return `## Input from ${input.agentName} (${input.taskTitle}): ${input.output}`;
}

export function composeUserPrompt(args: {
  brief: string;
  instructions: string;
  handoffs: HandoffInput[];
}): string {
  const parts = [`## Shared context\n${args.brief}`];
  for (const handoff of args.handoffs) {
    parts.push(handoffBlock(handoff));
  }
  parts.push(args.instructions);
  return parts.join("\n\n");
}

export function composeSystemPrompt(agent: { name: string; role: string }): string {
  return `${agent.role}\n\nYou are ${agent.name}, an agent in the Ariadne coordination layer.`;
}

export function packageDependencyOutputs(handoffs: HandoffInput[]): string {
  if (handoffs.length === 0) return "No dependency output to review.";
  return handoffs.map(handoffBlock).join("\n\n");
}
