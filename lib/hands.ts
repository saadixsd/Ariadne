/*
  The hands on the thread. Odysseus is the Drafter: researches, drafts, revises.
  Daedalus fact-checks the draft, claim by claim, toward your goal. You hold the thread,
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
  { name: ODYSSEUS, provider: "anthropic", family: "Writes and revises", does: "Answers from your brief and sources, and revises with your decisions." },
  { name: DAEDALUS, provider: "openai", family: "Fact-checks", does: "Fact-checks the draft claim by claim against your sources and the web, and labels each claim supported, unsupported or wrong, with evidence. It doesn't write a second answer." },
  { name: HUMAN_HAND, provider: "human", family: "Human", does: "You judge the flagged claims. Nothing moves on, and nothing is final, until you say so." },
] as const;
