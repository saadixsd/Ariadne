"use client";

import { useEffect } from "react";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-xs font-semibold tracking-[0.22em] text-thread">ARIADNE</p>
      <h1 className="mt-2 text-2xl font-semibold leading-tight">The workspace hit an error</h1>
      <p className="mt-3 text-sm leading-normal text-ink-dim">
        The page failed to render. Try again. This screen does not start an agent run.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="ink-on-thread mt-5 w-fit bg-thread px-3 py-2 text-sm font-medium hover:bg-thread-bright"
      >
        Try again
      </button>
    </main>
  );
}
