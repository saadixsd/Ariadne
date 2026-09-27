import type { TaskDTO } from "@/lib/types";

export function dependenciesMet(task: TaskDTO, tasks: TaskDTO[]): boolean {
  return task.dependsOn.every(
    (id) => tasks.find((item) => item.id === id)?.status === "done",
  );
}

export function canRunTask(task: TaskDTO, tasks: TaskDTO[]): boolean {
  if (
    task.status === "running" ||
    task.status === "awaiting_approval" ||
    task.status === "done"
  ) {
    return false;
  }
  return dependenciesMet(task, tasks);
}

export function taskNumber(taskId: string, tasks: TaskDTO[]): number {
  const index = tasks.findIndex((task) => task.id === taskId);
  return index >= 0 ? index + 1 : 0;
}

export function dependencyLabel(task: TaskDTO, tasks: TaskDTO[]): string {
  if (task.dependsOn.length === 0) return "no dependencies";
  const labels = task.dependsOn.map((id) => {
    const number = taskNumber(id, tasks);
    return number > 0 ? `#${number}` : "a missing task";
  });
  return `needs ${labels.join(", ")}`;
}

export function providerLabel(provider: string): string {
  if (provider === "anthropic") return "Claude";
  if (provider === "openai") return "GPT";
  if (provider === "human") return "Human";
  return provider;
}

export function nextTask(taskId: string, tasks: TaskDTO[]): TaskDTO | undefined {
  return tasks.find((task) => task.dependsOn.includes(taskId));
}

export function cascadeFrom(taskId: string, tasks: TaskDTO[]): TaskDTO[] {
  const root = tasks.find((task) => task.id === taskId);
  const result: TaskDTO[] = root ? [root] : [];
  const seen = new Set<string>(root ? [root.id] : []);

  function visit(id: string) {
    for (const task of tasks) {
      if (seen.has(task.id)) continue;
      if (!task.dependsOn.includes(id)) continue;
      seen.add(task.id);
      result.push(task);
      visit(task.id);
    }
  }

  visit(taskId);
  return result;
}
