"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  INTERVENE_ACTIONS,
  type ChallengeFields,
  type ContextFields,
  type CorrectFields,
  type InterveneKind,
  appendInterventionToBrief,
  formatBriefLine,
  formatNoteLine,
  interveneDestination,
} from "@/lib/intervene";
import { MAX_NOTE_CHARS } from "@/lib/limits";

export type InterveneSaveBrief = (brief: string) => Promise<string | null>;

/**
 * Persistent Intervene control: four structured actions, never a chat box.
 * Add context / Challenge / Correct write the brief (or the knot note while
 * judging). Change direction opens the existing ContextDrawer.
 */
export function InterveneMenu({
  brief,
  judging,
  onSaveBrief,
  onAppendNote,
  onChangeDirection,
  onOpenKnot,
  compact = false,
}: {
  brief: string;
  /** True when a knot is awaiting approval (Human Check #2). */
  judging: boolean;
  onSaveBrief: InterveneSaveBrief;
  /** Returns an error string, or null on success. */
  onAppendNote: (line: string) => string | null;
  onChangeDirection: () => void;
  /** Open the knot sheet when the user needs to land a note there. */
  onOpenKnot?: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<InterveneKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open && !form) return;
    function onDoc(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if ((target as Element).closest?.("[data-intervene-panel]")) return;
      setOpen(false);
      setForm(null);
      setError(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setForm(null);
        setError(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, form]);

  function pick(kind: InterveneKind) {
    setError(null);
    setOpen(false);
    if (kind === "direction") {
      onChangeDirection();
      setForm(null);
      return;
    }
    if ((kind === "challenge" || kind === "correct") && judging) {
      onOpenKnot?.();
    }
    setForm(kind);
  }

  async function submitContext(fields: ContextFields) {
    const line = formatBriefLine("context", fields);
    const result = appendInterventionToBrief(brief, "context", line);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setBusy(true);
    try {
      const message = await onSaveBrief(result.brief);
      if (message) setError(message);
      else {
        setForm(null);
        setError(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitChallengeOrCorrect(kind: "challenge" | "correct", fields: ChallengeFields | CorrectFields) {
    const dest = interveneDestination(kind, judging);
    setBusy(true);
    setError(null);
    try {
      if (dest === "note") {
        const line = formatNoteLine(kind, fields);
        if (line.length > MAX_NOTE_CHARS) {
          setError(`That line is too long (${MAX_NOTE_CHARS} characters max).`);
          return;
        }
        const message = onAppendNote(line);
        if (message) setError(message);
        else {
          setForm(null);
          onOpenKnot?.();
        }
        return;
      }
      const line = formatBriefLine(kind, fields);
      const result = appendInterventionToBrief(brief, kind, line);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      const message = await onSaveBrief(result.brief);
      if (message) setError(message);
      else {
        setForm(null);
        setError(null);
      }
    } finally {
      setBusy(false);
    }
  }

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  useLayoutEffect(() => {
    if (!open && !form) {
      setAnchor(null);
      return;
    }
    const sync = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open, form]);

  const panel =
    open && anchor ? (
      <div
        id={menuId}
        role="menu"
        aria-label="Intervene"
        data-intervene-panel
        style={{ top: anchor.top, right: anchor.right }}
        className="fixed z-[60] w-[min(100vw-2rem,22rem)] rounded-xl border border-line bg-raised p-1 shadow-[0_18px_40px_-16px_rgba(31,26,20,.35)]"
      >
        <p className="px-3 pt-2 pb-1 font-mono text-[10.5px] tracking-[0.06em] text-ink-faint uppercase">
          Steer the thread · not a chat
        </p>
        {INTERVENE_ACTIONS.map((action) => (
          <button
            key={action.kind}
            type="button"
            role="menuitem"
            onClick={() => pick(action.kind)}
            className="w-full rounded-lg px-3 py-2 text-left hover:bg-panel"
          >
            <span className="block text-sm font-[560] text-ink">{action.label}</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-ink-dim">{action.hint}</span>
          </button>
        ))}
        <p className="px-3 pt-1 pb-2 text-[11.5px] leading-snug text-ink-faint">
          {judging
            ? "Challenges and corrections go into your knot note. Add context still updates the brief."
            : "Saved into the brief every step reads. At the knot, challenges and corrections go into your note instead."}
        </p>
      </div>
    ) : form && form !== "direction" && anchor ? (
      <div
        id={menuId}
        role="dialog"
        aria-label={INTERVENE_ACTIONS.find((item) => item.kind === form)?.label ?? "Intervene"}
        data-intervene-panel
        style={{ top: anchor.top, right: anchor.right }}
        className="fixed z-[60] w-[min(100vw-2rem,24rem)] rounded-xl border border-gate-line bg-raised p-4 shadow-[0_18px_40px_-16px_rgba(31,26,20,.35)]"
      >
        <InterveneForm
          kind={form}
          judging={judging}
          busy={busy}
          error={error}
          onCancel={() => {
            setForm(null);
            setError(null);
          }}
          onContext={(fields) => void submitContext(fields)}
          onChallenge={(fields) => void submitChallengeOrCorrect("challenge", fields)}
          onCorrect={(fields) => void submitChallengeOrCorrect("correct", fields)}
        />
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        data-intervene
        aria-expanded={open || !!form}
        aria-controls={menuId}
        onClick={() => {
          setError(null);
          if (form) {
            setForm(null);
            setOpen(false);
            return;
          }
          setOpen((value) => !value);
        }}
        className={compact ? "rt-btn rt-btn-ghost h-8 px-2.5 text-xs" : "rt-btn"}
        title="Steer the thread with structured context or disputes — not a chat"
      >
        Intervene
      </button>
      {panel && typeof document !== "undefined" ? createPortal(panel, document.body) : null}
    </div>
  );
}

function InterveneForm({
  kind,
  judging,
  busy,
  error,
  onCancel,
  onContext,
  onChallenge,
  onCorrect,
}: {
  kind: Exclude<InterveneKind, "direction">;
  judging: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onContext: (fields: ContextFields) => void;
  onChallenge: (fields: ChallengeFields) => void;
  onCorrect: (fields: CorrectFields) => void;
}) {
  const [text, setText] = useState("");
  const [claim, setClaim] = useState("");
  const [issue, setIssue] = useState("");
  const [was, setWas] = useState("");
  const [shouldBe, setShouldBe] = useState("");
  const dest = interveneDestination(kind, judging);
  const title = INTERVENE_ACTIONS.find((item) => item.kind === kind)?.label ?? "Intervene";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (kind === "context") onContext({ text });
    else if (kind === "challenge") onChallenge({ claim, issue });
    else onCorrect({ was, shouldBe });
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div>
        <p className="eyebrow text-[10px] text-gate-ink">Intervene · {title}</p>
        <p className="mt-1 text-[12.5px] leading-snug text-ink-dim">
          {dest === "note"
            ? "This becomes a line in your knot note. Use Ask for changes to send it back to Odysseus."
            : "This is appended to the brief. The next step you run will read it."}
        </p>
      </div>
      {kind === "context" ? (
        <label className="block text-[13px]">
          What should they know?
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            required
            className="mt-1 w-full resize-none rounded-[10px] border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-thread"
            placeholder="e.g. Only include rounds closed in 2024–2026."
          />
        </label>
      ) : null}
      {kind === "challenge" ? (
        <>
          <label className="block text-[13px]">
            Claim or passage
            <input
              value={claim}
              onChange={(event) => setClaim(event.target.value)}
              required
              className="mt-1 w-full rounded-[10px] border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-thread"
              placeholder="What they got wrong or left thin"
            />
          </label>
          <label className="block text-[13px]">
            What’s wrong
            <textarea
              value={issue}
              onChange={(event) => setIssue(event.target.value)}
              rows={2}
              required
              className="mt-1 w-full resize-none rounded-[10px] border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-thread"
              placeholder="Incorrect, unsupported, outdated, missing…"
            />
          </label>
        </>
      ) : null}
      {kind === "correct" ? (
        <>
          <label className="block text-[13px]">
            What to correct
            <input
              value={was}
              onChange={(event) => setWas(event.target.value)}
              required
              className="mt-1 w-full rounded-[10px] border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-thread"
              placeholder="The wrong fact or wording"
            />
          </label>
          <label className="block text-[13px]">
            Correct value / wording
            <input
              value={shouldBe}
              onChange={(event) => setShouldBe(event.target.value)}
              required
              className="mt-1 w-full rounded-[10px] border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-thread"
              placeholder="What it should say"
            />
          </label>
        </>
      ) : null}
      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rt-btn rt-btn-knot h-9 flex-1 px-3 text-sm">
          {busy ? "Saving…" : dest === "note" ? "Add to note" : "Save to brief"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="rt-btn h-9 px-3 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
