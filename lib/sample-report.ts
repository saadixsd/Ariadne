/*
  The public sample report: a hand-built example from the Ariadne team, readable without an
  account. The Canada figure matches PCH's report on root name server locations
  (https://pch.net/ixp/summary_root_servers, "Canada(35)", read Oct 23, 2026), the same answer a
  real run gave. PCH counts root name server locations per country, so the sample says
  "locations" and does not claim a separate count of sites vs instances.
*/
export type SampleClaim = { claim: string; verdict: "supported" | "unsupported" | "wrong" | "disputed"; quote: string; source: string; decision?: string };

export const SAMPLE = {
  question: "How many DNS root server locations are there in Canada?",
  checkedOn: "2026-10-23",
  answer: [
    "**Packet Clearing House (PCH) lists 35 DNS root server locations in Canada** (its report on root name server locations, read on October 23, 2026).",
    "That puts Canada second after the United States (180) in PCH's per-country table, which covers 159 countries with root name servers.",
    "For scale, root-servers.org states that the whole root server system consists of 2,048 operational instances run by 12 independent operators.",
    "PCH counts locations per country, and other lists (such as root-servers.org's own map) count instances differently, so totals can differ between sources and change as operators add or retire servers.",
  ],
  flow: [
    { stage: "Ask or paste", text: "Type a question, or paste an answer from any AI. One box, one Check button." },
    { stage: "Write and check", text: "A writer drafts the answer. A fact-checker checks each claim against the web pages it cites (Supported, Not supported, or Wrong) and sends what it found back to the writer." },
    { stage: "Only what needs you", text: "Claims a source contradicts, and that matter, wait under Needs you (at most 5): Keep it, Use the source's version, Remove it, or Write my own. Everything else is handled under Checked automatically. Claims with no source are kept and marked not confirmed." },
    { stage: "Final answer, checked again", text: "Approve it, copy it, or export it as PDF, Word, PowerPoint or Markdown. Use Change something at any point." },
  ],
  claims: [
    {
      claim: "PCH lists 35 DNS root server locations in Canada.",
      verdict: "supported",
      quote: "“Countries with Root Nameservers: 159 … United States(180), Canada(35), Brazil(33) …”",
      source: "https://pch.net/ixp/summary_root_servers",
    },
    {
      claim: "Canada has the second-highest count in PCH's table, after the United States (180).",
      verdict: "supported",
      quote: "“United States(180), Canada(35), Brazil(33), Germany(27) …” (the list is sorted by count)",
      source: "https://pch.net/ixp/summary_root_servers",
    },
    {
      claim: "Root-servers.org states that the root server system consists of 2,048 operational instances operated by 12 independent operators.",
      verdict: "supported",
      quote: "“… the root server system consists of 2048 operational instances operated by the 12 independent root server operators.”",
      source: "https://root-servers.org/",
    },
    {
      claim: "Other lists count instances differently, so totals can differ between sources.",
      verdict: "unsupported",
      quote: "No page states this directly; it follows from PCH counting locations while root-servers.org counts instances.",
      source: "https://root-servers.org/",
      decision: "Keep it (marked as not confirmed by a source)",
    },
  ] as SampleClaim[],
};
