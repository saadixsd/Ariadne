/*
  The public sample report (fix plan O1), readable without an account. Every quote and
  number below was read on root-servers.org on Oct 21, 2026 (page: "As of 2026-10-21T22:45:17Z
  …"; per-site list: https://root-servers.org/map-data.js). It shows the format of an Ariadne
  report; replace it with the output of a real production run of the same question once the
  tester checklist passes (docs/TESTER_READY.md).
*/
export type SampleClaim = { claim: string; verdict: "supported" | "unsupported" | "wrong" | "disputed"; quote: string; source: string; decision?: string };

export const SAMPLE = {
  question: "How many DNS root server instances are located in Canada?",
  checkedOn: "2026-10-21",
  answer: [
    "**As of October 21, 2026, root-servers.org lists 45 root server instances at 44 sites in Canada**, in nine cities: Calgary, Halifax, Moncton, Montreal, Ottawa, Saskatoon, Toronto, Vancouver and Winnipeg.",
    "They belong to seven of the thirteen root servers: E (13 instances), D (9), F (9), K (5), I (4), L (3) and J (2).",
    "For scale, root-servers.org states that the whole root server system consists of 2,048 operational instances run by 12 independent operators.",
    "The Canadian figures are Ariadne's count of root-servers.org's own per-site list (map-data.js, the file the site's map loads); the site does not print a Canada total. The list changes as operators add or retire instances, so the count is only valid for the date above.",
  ],
  flow: [
    { stage: "Draft", text: "One model answers the question and cites a source next to each claim." },
    { stage: "Fact-check", text: "A second model checks each claim against the page it cites: supported, not supported or wrong, with the quoted words. Ariadne then checks every quote is really on that page." },
    { stage: "Your review", text: "You decide only the flagged claims (keep as written, fix it from the source, or remove), one by one or in one click." },
    { stage: "Final answer", text: "The answer is rewritten from your decisions and fact-checked again; the claims table below comes from that last check." },
  ],
  claims: [
    {
      claim: "Root-servers.org states that the root server system consists of 2,048 operational instances operated by 12 independent operators.",
      verdict: "supported",
      quote: "“As of 2026-10-21T22:45:17Z, the root server system consists of 2048 operational instances operated by the 12 independent root server operators.”",
      source: "https://root-servers.org/",
    },
    {
      claim: "Root-servers.org's site list has Canadian sites in Calgary, Halifax, Moncton, Montreal, Ottawa, Saskatoon, Toronto, Vancouver and Winnipeg.",
      verdict: "supported",
      quote: "Rows such as “{\"root\": \"E\", \"town\": \"Calgary\", \"country\": \"CA\", … \"instances\": 1}” in the site list, one per site.",
      source: "https://root-servers.org/map-data.js",
    },
    {
      claim: "Root-servers.org lists 45 root server instances at 44 sites in Canada.",
      verdict: "unsupported",
      quote: "Computed: the 44 rows with \"country\": \"CA\" in map-data.js, summing their \"instances\" = 45. No page states a Canada total.",
      source: "https://root-servers.org/map-data.js",
      decision: "Keep as written (labelled as Ariadne's count, with its date)",
    },
    {
      claim: "The Canadian instances belong to the E, D, F, K, I, L and J root servers.",
      verdict: "supported",
      quote: "The \"root\" field of the 44 Canadian rows takes only the values D, E, F, I, J, K and L.",
      source: "https://root-servers.org/map-data.js",
    },
    {
      claim: "The 13 root name servers are operated by 12 independent organisations.",
      verdict: "supported",
      quote: "“The 13 root name servers are operated by 12 independent organisations.”",
      source: "https://root-servers.org/",
    },
  ] as SampleClaim[],
};
