export function ViewSwitch({
  view,
  projectId,
  tone = "dark",
}: {
  view: "board" | "tree";
  projectId: string;
  tone?: "dark" | "light";
}) {
  const query = `project=${encodeURIComponent(projectId)}`;
  const board = `/?${query}`;
  const tree = `/tree?${query}`;
  const light = tone === "light";
  const shell = light ? "flex overflow-hidden rounded-md bg-white text-sm ring-1 ring-[#dfe9e1]" : "flex text-sm ring-1 ring-white/15";
  const active = light
    ? "bg-[#0e5c36] px-2 py-1 font-medium text-white"
    : "bg-thread px-2 py-1 font-medium text-(--color-base)";
  const idle = light ? "px-2 py-1 text-[#5c6f61] hover:text-[#101812]" : "px-2 py-1 text-ink-dim hover:text-ink";
  return (
    <nav aria-label="View" className={shell}>
      <a href={board} aria-current={view === "board" ? "page" : undefined} className={view === "board" ? active : idle}>
        Board
      </a>
      <a href={tree} aria-current={view === "tree" ? "page" : undefined} className={view === "tree" ? active : idle}>
        Tree
      </a>
    </nav>
  );
}
