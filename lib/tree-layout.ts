import type { TreeWorkflow } from "@/lib/live-tree";

export function columnsByDepth(tree: TreeWorkflow): string[][] {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const node of tree.nodes) {
    parents.set(node.id, []);
    children.set(node.id, []);
  }
  for (const edge of tree.edges) {
    children.get(edge.from)?.push(edge.to);
    parents.get(edge.to)?.push(edge.from);
  }

  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  function depthOf(id: string): number {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const incoming = parents.get(id) ?? [];
    const value = incoming.length === 0 ? 0 : Math.max(...incoming.map((parent) => depthOf(parent))) + 1;
    visiting.delete(id);
    depth.set(id, value);
    return value;
  }

  for (const node of tree.nodes) depthOf(node.id);

  const placed = new Set<string>();
  const columns: string[][] = [];

  function place(id: string) {
    if (placed.has(id)) return;
    placed.add(id);
    const column = depth.get(id) ?? 0;
    while (columns.length <= column) columns.push([]);
    columns[column].push(id);
    for (const child of children.get(id) ?? []) place(child);
  }

  for (const node of tree.nodes) {
    if ((parents.get(node.id) ?? []).length === 0) place(node.id);
  }
  for (const node of tree.nodes) place(node.id);

  return columns;
}
