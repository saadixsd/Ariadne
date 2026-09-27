export type BoardProjectRef = {
  id: string;
  template: string;
  brief: string;
};

export function needsSharedContextPrompt(project: { template: string; brief: string }): boolean {
  return project.template === "own" && project.brief.trim().length === 0;
}

export function pickBoardProject<T extends BoardProjectRef>(
  projects: readonly T[],
  requestedId?: string | null,
): T | undefined {
  if (requestedId) {
    const requested = projects.find((project) => project.id === requestedId);
    if (requested) return requested;
  }
  return projects.find((project) => project.template === "own") ?? projects[0];
}

export function acceptPolledProject(selectedId: string, polledId: string): boolean {
  return selectedId.length > 0 && selectedId === polledId;
}
