export function SetupBanner({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  return (
    <div role="alert" className="border-b border-danger/25 bg-danger/5 px-7 py-2 text-[13px] leading-normal text-ink">
      <b className="font-semibold text-danger">Agent keys are missing, so Run cannot call Claude or GPT.</b>{" "}
      Add <span className="font-mono text-xs">{missing.join(", ")}</span> to <span className="font-mono text-xs">.env</span>, then restart{" "}
      <span className="font-mono text-xs">npm run dev</span>. Opening this page does not call the providers.
    </div>
  );
}
