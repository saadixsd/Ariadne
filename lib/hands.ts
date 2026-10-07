/*
  The hands on the thread. Odysseus (Claude) is the Drafter: researches, drafts, revises.
  Daedalus (GPT) is the Challenger: tries to prove the draft wrong. You hold the thread,
  as Ariadne did, and judge at every knot. (Until Oct 6 2026 new projects had Daedalus
  drafting and Odysseus reviewing; projects made then keep their own agent roles.)

  Projects created before the rename have Agent rows named "Scout" / "Maker".
  migrations/0003_phase2.sql renames them in place; until that runs (and for any
  payload snapshot written earlier) handName() maps the old names for display and
  for the name a hand is given in its prompt. Model ids and roles are unchanged.
*/

export const ODYSSEUS = "Odysseus";
export const DAEDALUS = "Daedalus";
export const HUMAN_HAND = "You";

const LEGACY: Record<string, string> = { Scout: ODYSSEUS, Maker: DAEDALUS };

export function handName(name: string): string {
  return LEGACY[name] ?? name;
}

/** The fixed roster shown in Settings. Read-only: no model switching in V1. */
export const HANDS = [
  { name: ODYSSEUS, provider: "anthropic", family: "Claude", does: "The Drafter. Researches the brief, writes the answer and revises it." },
  { name: DAEDALUS, provider: "openai", family: "GPT", does: "The Challenger. Tries to prove the draft wrong. It critiques the work; it doesn't write a second answer." },
  { name: HUMAN_HAND, provider: "human", family: "Human", does: "The judge. Nothing is final until you tie it off." },
] as const;
