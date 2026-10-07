"use client";

import { useMemo } from "react";
import { Markdown } from "@/components/OutputView";
import { useHydrated } from "@/components/use-now";
import { finalArtifactOf, type FinalArtifact } from "@/lib/final-artifact";

function Section({
  title,
  body,
  tone = "plain",
}: {
  title: string;
  body: string;
  tone?: "plain" | "warn";
}) {
  return (
    <section
      data-final-section={title.toLowerCase()}
      className={`rounded-lg border px-3 py-2.5 ${tone === "warn" ? "border-gate-line bg-gate-bg/50" : "border-line bg-raised"}`}
    >
      <p className={`font-mono text-[10.5px] tracking-[0.06em] uppercase ${tone === "warn" ? "text-gate-ink" : "text-ink-faint"}`}>{title}</p>
      <div className="mt-1 text-[13px] leading-normal text-ink">
        <Markdown text={body} />
      </div>
    </section>
  );
}

function useFinalArtifact(text: string | null | undefined): FinalArtifact | null {
  const hydrated = useHydrated();
  return useMemo(() => (hydrated && text ? finalArtifactOf(text) : null), [hydrated, text]);
}

/**
 * Tied-off writeup as Answer / Sources / Disagreements / Attention — or plain
 * prose when the headings are missing. Parsed on the client (Worker CPU budget).
 */
export function FinalArtifactView({ output }: { output: string }) {
  const artifact = useFinalArtifact(output);
  if (!artifact) {
    return <Markdown text={output} />;
  }
  if (!artifact.structured) {
    return <Markdown text={artifact.prose} />;
  }
  const none = (value: string | null) => !value || /^none\.?$/i.test(value.trim());
  return (
    <div data-final-artifact="structured" className="grid gap-2.5">
      <Section title="Answer" body={artifact.answer || artifact.prose} />
      {artifact.sources && !none(artifact.sources) ? <Section title="Sources" body={artifact.sources} /> : null}
      {artifact.disagreements && !none(artifact.disagreements) ? (
        <Section title="Disagreements" body={artifact.disagreements} />
      ) : (
        <p className="px-0.5 text-[12px] text-ink-faint">No open disagreements recorded.</p>
      )}
      {artifact.attention && !none(artifact.attention) ? (
        <Section title="Attention required" body={artifact.attention} tone="warn" />
      ) : (
        <p className="px-0.5 text-[12px] text-ink-faint">Nothing flagged for attention.</p>
      )}
    </div>
  );
}

/** True when this step looks like the Tie Off writeup (final model step after the knot). */
export function isTieOffWriteup(task: { title: string; instructions: string }, agents: { id: string; provider: string }[], taskAgentId: string): boolean {
  const agent = agents.find((item) => item.id === taskAgentId);
  if (!agent || agent.provider === "human") return false;
  return /tied-off|final version|final answer|write the final|write the tied/i.test(`${task.title}\n${task.instructions}`);
}
