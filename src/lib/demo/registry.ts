/** Display metadata only. Expected results live in test/operator material. */
export const DEMO_CASES = [
  {
    id: "D01",
    label: "Complete file",
    description:
      "A broker supplies consistent preparation documents for a small business purchase.",
  },
  {
    id: "D02",
    label: "Scattered documents and wrong periods",
    description:
      "Buyer, seller and accountant send a mixed packet with older periods and a combined file.",
  },
  {
    id: "D03",
    label: "Values that need human correction",
    description:
      "Ordinary financial forms contain readings that need a source check and correction.",
  },
  {
    id: "D04",
    label: "Phone photo needs a replacement",
    description: "An owner's photographed financial statement needs a clearer signed replacement.",
  },
  {
    id: "D05",
    label: "Questions that match the problem",
    description: "The transaction documents disagree and the lease needs supporting renewal terms.",
  },
  {
    id: "D06",
    label: "An answer becomes outdated",
    description: "An answered price question must be reconsidered when amended documents arrive.",
  },
  {
    id: "D07",
    label: "Upload failure and recovery",
    description:
      "A protected file and an interrupted read need recovery without losing the other documents.",
  },
  {
    id: "D08",
    label: "Prepared for the lender, with later work outstanding",
    description:
      "Preparation can finish while an explicitly deferred lender task remains outstanding.",
  },
] as const;
export type DemoCaseId = (typeof DEMO_CASES)[number]["id"];
export const demoCode = (id: DemoCaseId) => `Synthetic-${id}`;
export function demoCase(id: string) {
  const found = DEMO_CASES.find((c) => c.id === id);
  if (!found) throw Error("Unknown demo case");
  return found;
}
