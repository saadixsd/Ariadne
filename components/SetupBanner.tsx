export function SetupBanner({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  return (
    <div role="alert" className="border-b border-danger/40 bg-danger/10 px-4 py-3 text-sm leading-normal">
      <p className="font-semibold text-danger">Agent keys are missing, so Run cannot call Claude or GPT.</p>
      <p className="mt-1 text-ink">
        Add <span className="font-mono">{missing.join(", ")}</span> to{" "}
        <span className="font-mono">.env</span>, then restart{" "}
        <span className="font-mono">npm run dev</span>. Opening this page does not call the providers.
      </p>
    </div>
  );
}
