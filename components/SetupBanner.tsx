// `missing` names server env vars. They are for the operator's logs, never for the user.
export function SetupBanner({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  return (
    <div role="alert" className="border-b border-danger/25 bg-danger/5 gutter-safe py-2 text-[13px] leading-normal text-ink">
      <b className="font-semibold text-danger">Ariadne can&apos;t reach Claude or GPT right now, so Run is paused.</b>{" "}
      Your projects and briefs are safe. Try again later, or tell us through Give feedback in the account menu.
    </div>
  );
}
