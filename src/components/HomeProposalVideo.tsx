import type { ReactNode } from "react";
export type ProposalSlots = { titleAccessory: ReactNode; video: ReactNode };
// The HTML streaming player is exclusive to the website.
export function HomeProposalVideo({
  children,
}: {
  active: boolean;
  children: (slots: ProposalSlots) => ReactNode;
}) {
  return children({ titleAccessory: null, video: null });
}
