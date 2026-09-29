export function ViewSwitch({ view, projectId }: { view: "board" | "tree"; projectId: string }) {
  const query = `project=${encodeURIComponent(projectId)}`;
  const board = `/?${query}`;
  const tree = `/tree?${query}`;
  const active = "bg-thread px-2 py-1 font-medium text-raised";
  const idle = "px-2 py-1 text-ink-dim hover:text-ink";
  return (
    <nav aria-label="View" className="flex overflow-hidden rounded-md bg-raised text-sm ring-1 ring-line">
      <a href={board} aria-current={view === "board" ? "page" : undefined} className={view === "board" ? active : idle}>
        Board
      </a>
      <a href={tree} aria-current={view === "tree" ? "page" : undefined} className={view === "tree" ? active : idle}>
        Tree
      </a>
    </nav>
  );
}
