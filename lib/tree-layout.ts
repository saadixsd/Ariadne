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

/* ---------- Red Thread labyrinth ---------- */

export type Point = { x: number; y: number };

export type SpiralOptions = {
  /** Outer margin from the canvas edge to the outermost path. */
  mx: number;
  my: number;
  /** Distance between rings (horizontal legs move by gy, vertical legs by gx). */
  gx: number;
  gy: number;
  /** Stop spiralling when the next leg would be shorter than this. */
  minX: number;
  minY: number;
  /** Half-size of the centre piece, so the path ends at its edge. */
  centre: { halfW: number; halfH: number };
};

/**
 * A rounded-rectangle spiral seen from above: starts at the top-left "door", runs clockwise and
 * winds inward, ending at the edge of a centre piece. Returns the corner points of the polyline.
 */
export function rectSpiral(width: number, height: number, options: SpiralOptions): { points: Point[]; centre: Point } {
  let left = options.mx;
  let top = options.my;
  let right = width - options.mx;
  let bottom = height - options.my;
  const points: Point[] = [{ x: left, y: top }];
  let next: "right" | "down" | "left" | "up" = "right";
  for (let guard = 0; guard < 24; guard += 1) {
    if (next === "right") {
      if (right - left < options.minX && points.length > 1) break;
      points.push({ x: right, y: top });
      top += options.gy;
      next = "down";
    } else if (next === "down") {
      if (bottom - top < options.minY) break;
      points.push({ x: right, y: bottom });
      right -= options.gx;
      next = "left";
    } else if (next === "left") {
      if (right - left < options.minX) break;
      points.push({ x: left, y: bottom });
      bottom -= options.gy;
      next = "up";
    } else {
      if (bottom - top < options.minY) break;
      points.push({ x: left, y: top });
      left += options.gx;
      next = "right";
    }
  }
  const centre = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const last = points[points.length - 1];
  if (next === "right" || next === "left") {
    if (Math.abs(last.x - centre.x) > 1) points.push({ x: centre.x, y: last.y });
    points.push({ x: centre.x, y: centre.y + (last.y < centre.y ? -1 : 1) * options.centre.halfH });
  } else {
    if (Math.abs(last.y - centre.y) > 1) points.push({ x: last.x, y: centre.y });
    points.push({ x: centre.x + (last.x < centre.x ? -1 : 1) * options.centre.halfW, y: centre.y });
  }
  return { points, centre };
}

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += distance(points[index - 1], points[index]);
  return total;
}

/** Point and unit direction at arc length s along the polyline. */
export function pointAt(points: Point[], s: number): Point & { dx: number; dy: number } {
  let remaining = Math.max(0, s);
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const length = distance(a, b);
    if (remaining <= length || index === points.length - 1) {
      const t = length === 0 ? 0 : Math.min(1, remaining / length);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: Math.sign(b.x - a.x), dy: Math.sign(b.y - a.y) };
    }
    remaining -= length;
  }
  const end = points[points.length - 1] ?? { x: 0, y: 0 };
  return { ...end, dx: 0, dy: 0 };
}

/** The part of the polyline between arc lengths s0 and s1. */
export function slicePolyline(points: Point[], s0: number, s1: number): Point[] {
  const out: Point[] = [pointAt(points, s0)];
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    travelled += distance(points[index - 1], points[index]);
    if (travelled > s0 && travelled < s1) out.push(points[index]);
  }
  const end = pointAt(points, s1);
  out.push({ x: end.x, y: end.y });
  return out.map(({ x, y }) => ({ x, y }));
}

/** SVG path through the points with rounded corners. */
export function roundedPath(points: Point[], radius: number): string {
  if (points.length === 0) return "";
  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const r = Math.min(radius, distance(prev, corner) / 2, distance(corner, next) / 2);
    const inX = Math.sign(corner.x - prev.x);
    const inY = Math.sign(corner.y - prev.y);
    const outX = Math.sign(next.x - corner.x);
    const outY = Math.sign(next.y - corner.y);
    parts.push(`L ${corner.x - inX * r} ${corner.y - inY * r}`);
    parts.push(`Q ${corner.x} ${corner.y} ${corner.x + outX * r} ${corner.y + outY * r}`);
  }
  const last = points[points.length - 1];
  if (points.length > 1) parts.push(`L ${last.x} ${last.y}`);
  return parts.join(" ");
}
