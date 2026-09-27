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
