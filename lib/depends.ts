export function parseDepends(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

type DependencyTask = {
  id: string;
  dependsOn: string;
};

export function directDependencies<T extends DependencyTask>(
  dependsOn: string,
  byId: Map<string, T>,
): T[] {
  return parseDepends(dependsOn).flatMap((id) => {
    const task = byId.get(id);
    return task ? [task] : [];
  });
}

export function transitiveDependencies<T extends DependencyTask>(
  dependsOn: string,
  byId: Map<string, T>,
): T[] {
  const result: T[] = [];
  const seen = new Set<string>();

  function visit(id: string) {
    if (seen.has(id)) return;
    const task = byId.get(id);
    if (!task) return;
    seen.add(id);
    for (const parentId of parseDepends(task.dependsOn)) visit(parentId);
    result.push(task);
  }

  for (const id of parseDepends(dependsOn)) visit(id);
  return result;
}

export function unmetDependencyIds<T extends DependencyTask & { status: string }>(
  dependsOn: string,
  byId: Map<string, T>,
): string[] {
  return parseDepends(dependsOn).filter((id) => byId.get(id)?.status !== "done");
}

export function dependentTasks<T extends DependencyTask>(rootId: string, tasks: T[]): T[] {
  const result: T[] = [];
  const seen = new Set<string>();

  function visit(id: string) {
    for (const task of tasks) {
      if (seen.has(task.id)) continue;
      if (!parseDepends(task.dependsOn).includes(id)) continue;
      seen.add(task.id);
      result.push(task);
      visit(task.id);
    }
  }

  visit(rootId);
  return result;
}
