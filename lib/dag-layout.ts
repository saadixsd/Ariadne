/*
  Layered layout for the Tree: the path is drawn from the tasks' real dependencies,
  not from the order they were created in.

  - Unknown ids, duplicates and self-references in dependsOn are ignored.
  - Cycles cannot come from the UI, but old or hand-edited data could hold one. A
    depth-first pass drops the edges that close a cycle (reported in `dropped`) so
    the layout always terminates and every task is still drawn once.
  - Layer = longest path from a source, so a join sits after all of its inputs.
  - Order inside a layer: topological order, then a few barycentre sweeps to keep
    edges from crossing where it is cheap to avoid.
*/

export type DagTask = { id: string; dependsOn: readonly string[] };
export type DagEdge = { from: string; to: string };

export type DagLayout = {
  /** Columns left to right. layers[0] are the tasks that need nothing (fed by the door). */
  layers: string[][];
  layerOf: Map<string, number>;
  /** Row inside its layer. */
  rowOf: Map<string, number>;
  /** A topological order (stable: ties keep the input order). */
  order: string[];
  /** Dependency edges kept for drawing, parent -> child. */
  edges: DagEdge[];
  /** Edges dropped to break a cycle. Empty for any workflow the UI can create. */
  dropped: DagEdge[];
  sources: string[];
  sinks: string[];
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
};

export function layoutDag(tasks: readonly DagTask[]): DagLayout {
  const ids = tasks.map((task) => task.id);
  const known = new Set(ids);
  const index = new Map(ids.map((id, position) => [id, position]));
  const wanted = new Map<string, string[]>();
  for (const task of tasks) {
    const deps = [...new Set(task.dependsOn)].filter((id) => known.has(id) && id !== task.id);
    wanted.set(task.id, deps);
  }

  // Cycle safety: iterative DFS over parent links; an edge to a node on the stack closes a cycle.
  const dropped: DagEdge[] = [];
  const state = new Map<string, 0 | 1 | 2>(); // 0 new, 1 on stack, 2 done
  const kept = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const start of ids) {
    if (state.get(start)) continue;
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }];
    state.set(start, 1);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const deps = wanted.get(frame.id) ?? [];
      if (frame.next >= deps.length) {
        state.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const parent = deps[frame.next++];
      const seen = state.get(parent) ?? 0;
      if (seen === 1) {
        dropped.push({ from: parent, to: frame.id });
        continue;
      }
      kept.get(frame.id)?.push(parent);
      if (seen === 0) {
        state.set(parent, 1);
        stack.push({ id: parent, next: 0 });
      }
    }
  }

  const parents = new Map<string, string[]>(ids.map((id) => [id, kept.get(id) ?? []]));
  const children = new Map<string, string[]>(ids.map((id) => [id, []]));
  const edges: DagEdge[] = [];
  for (const id of ids) {
    for (const parent of parents.get(id) ?? []) {
      children.get(parent)?.push(id);
      edges.push({ from: parent, to: id });
    }
  }

  // Kahn's algorithm, always taking the earliest-created ready task: stable topological order.
  const remaining = new Map(ids.map((id) => [id, (parents.get(id) ?? []).length]));
  const ready = ids.filter((id) => remaining.get(id) === 0);
  const order: string[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0));
    const id = ready.shift() as string;
    order.push(id);
    for (const child of children.get(id) ?? []) {
      const left = (remaining.get(child) ?? 1) - 1;
      remaining.set(child, left);
      if (left === 0) ready.push(child);
    }
  }

  const layerOf = new Map<string, number>();
  for (const id of order) {
    const deps = parents.get(id) ?? [];
    layerOf.set(id, deps.length === 0 ? 0 : Math.max(...deps.map((parent) => layerOf.get(parent) ?? 0)) + 1);
  }
  const layers: string[][] = [];
  for (const id of order) {
    const layer = layerOf.get(id) ?? 0;
    while (layers.length <= layer) layers.push([]);
    layers[layer].push(id);
  }

  // Barycentre sweeps: down (by parents' rows), then up (by children's rows).
  const rowOf = new Map<string, number>();
  const setRows = () => layers.forEach((layer) => layer.forEach((id, row) => rowOf.set(id, row)));
  setRows();
  const centre = (neighbours: string[], fallback: number) =>
    neighbours.length === 0 ? fallback : neighbours.reduce((sum, id) => sum + (rowOf.get(id) ?? 0), 0) / neighbours.length;
  for (let sweep = 0; sweep < 4; sweep += 1) {
    const down = sweep % 2 === 0;
    const range = down ? layers.map((_, i) => i).slice(1) : layers.map((_, i) => i).slice(0, -1).reverse();
    for (const layerIndex of range) {
      const layer = layers[layerIndex];
      const keyed = layer.map((id, row) => ({
        id,
        key: centre(down ? (parents.get(id) ?? []) : (children.get(id) ?? []), row),
        row,
      }));
      keyed.sort((a, b) => a.key - b.key || a.row - b.row);
      layers[layerIndex] = keyed.map((item) => item.id);
      layers[layerIndex].forEach((id, row) => rowOf.set(id, row));
    }
  }
  setRows();

  return {
    layers,
    layerOf,
    rowOf,
    order,
    edges,
    dropped,
    sources: order.filter((id) => (parents.get(id) ?? []).length === 0),
    sinks: order.filter((id) => (children.get(id) ?? []).length === 0),
    parents,
    children,
  };
}

/** Every task upstream of `id` (what fed into it), for lineage highlighting. */
export function ancestorsOf(id: string, layout: Pick<DagLayout, "parents">): Set<string> {
  const found = new Set<string>();
  const stack = [...(layout.parents.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop() as string;
    if (found.has(next)) continue;
    found.add(next);
    stack.push(...(layout.parents.get(next) ?? []));
  }
  return found;
}

export type Placed = { x: number; y: number };

/** Centre points for a layered drawing: the door, every task, and the deliverable.
 *  `door` is the door card's own size: with it the first column sits half a column past the door's right edge
 *  (not a whole column past its centre), and the drawing is at least as tall as the door. */
export function placeDag(
  layout: Pick<DagLayout, "layers">,
  size: { colW: number; rowH: number; padX: number; padY: number; door?: { width: number; height: number } },
): { door: Placed; centre: Placed; nodes: Map<string, Placed>; width: number; height: number } {
  const rows = Math.max(1, ...layout.layers.map((layer) => layer.length));
  const height = Math.max(rows * size.rowH, size.door?.height ?? 0) + size.padY * 2;
  const mid = height / 2;
  const first = size.padX + (size.door ? size.door.width / 2 + size.colW / 2 : size.colW);
  const nodes = new Map<string, Placed>();
  layout.layers.forEach((layer, column) => {
    const x = first + column * size.colW;
    layer.forEach((id, row) => {
      nodes.set(id, { x, y: mid + (row - (layer.length - 1) / 2) * size.rowH });
    });
  });
  const columns = layout.layers.length;
  const centreX = first + columns * size.colW;
  return {
    door: { x: size.padX, y: mid },
    centre: { x: centreX, y: mid },
    nodes,
    width: centreX + size.padX,
    height,
  };
}
