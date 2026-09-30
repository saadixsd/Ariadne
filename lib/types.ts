export type AgentDTO = {
  id: string;
  projectId: string;
  name: string;
  provider: string;
  model: string;
  role: string;
  status: string;
};

export type TaskDTO = {
  id: string;
  projectId: string;
  agentId: string;
  title: string;
  instructions: string;
  status: string;
  dependsOn: string[];
  requiresApproval: boolean;
  output: string | null;
  model: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type ActivityEventDTO = {
  id: string;
  projectId: string;
  type: string;
  message: string;
  taskId: string | null;
  /** Structured handoff/approval data (null on events written before these columns existed). */
  fromTaskId: string | null;
  toTaskId: string | null;
  runId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export type TaskRunDTO = {
  id: string;
  taskId: string;
  attempt: number;
  outcome: string;
  provider: string | null;
  model: string | null;
  systemPrompt: string | null;
  prompt: string | null;
  output: string | null;
  error: string | null;
  latencyMs: number | null;
  tries: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type ProjectDTO = {
  id: string;
  name: string;
  brief: string;
  template: string;
  createdAt: string;
  agents: AgentDTO[];
  tasks: TaskDTO[];
  events: ActivityEventDTO[];
};
