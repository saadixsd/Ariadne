export function ViewSwitch({ view, projectId }: { view: "board" | "tree"; projectId: string }) {
  const query = `project=${encodeURIComponent(projectId)}`;
  const board = `/?${query}`;
  const tree = `/tree?${query}`;
  const base = "touch-min rounded-full px-3.5 py-[5px] text-[13px] font-[550] transition-colors";
  const active = `${base} bg-ink text-raised`;
  const idle = `${base} text-ink-dim hover:text-ink`;
  return (
    <nav aria-label="View" className="flex rounded-full border border-line bg-panel p-[3px]">
      <a href={board} aria-current={view === "board" ? "page" : undefined} className={view === "board" ? active : idle}>
        Board
      </a>
      <a href={tree} aria-current={view === "tree" ? "page" : undefined} className={view === "tree" ? active : idle}>
        Tree
      </a>
    </nav>
  );
}
