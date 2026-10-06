export function ViewSwitch({ view, projectId }: { view: "board" | "tree"; projectId: string }) {
  const query = `project=${encodeURIComponent(projectId)}`;
  const base = "touch-min rounded-full px-3.5 py-[5px] text-[13px] font-[550] transition-colors";
  const active = `${base} bg-ink text-raised`;
  const idle = `${base} text-ink-dim hover:text-ink`;
  // The current view is a label, not a link: clicking it would only reload the page.
  const item = (name: "board" | "tree", label: string, href: string) =>
    view === name ? (
      <span aria-current="page" className={active}>
        {label}
      </span>
    ) : (
      <a href={href} className={idle}>
        {label}
      </a>
    );
  return (
    <nav aria-label="View" className="flex rounded-full border border-line bg-panel p-[3px]">
      {item("board", "Board", `/dashboard?${query}`)}
      {item("tree", "Tree", `/tree?${query}`)}
    </nav>
  );
}
