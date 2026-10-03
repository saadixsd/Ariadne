/**
 * Where "New project" goes from pages that have no dialog of their own (the tree, settings):
 * the board, which opens its new-project dialog when it sees ?new=1. Creating a project
 * never calls a model, so this costs one ordinary board load.
 */
export function newProjectHref(projectId?: string | null) {
  return projectId ? `/?project=${encodeURIComponent(projectId)}&new=1` : "/?new=1";
}
