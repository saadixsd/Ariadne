/*
  The hands on the thread. Odysseus researches and reviews (Claude); Daedalus drafts
  and builds (GPT); You hold the thread, as Ariadne did, and judge at every knot.

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
  { name: ODYSSEUS, provider: "anthropic", family: "Claude", does: "Researches and reviews. Reads the thread, investigates, critiques." },
  { name: DAEDALUS, provider: "openai", family: "GPT", does: "Drafts and builds. Writes, generates, produces the artifact." },
  { name: HUMAN_HAND, provider: "human", family: "Human", does: "Holds the thread. Nothing moves past a knot until you tie it off." },
] as const;
