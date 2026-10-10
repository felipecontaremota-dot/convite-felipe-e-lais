import type { RSVP } from "../../types/domain";

// Read legacy MAYBE as the baseline undecided option. No mutation happens on load.
// Only an explicit save writes the PR21 PENDING/CONFIRMED/DECLINED contract.
export function restoredRsvpStatus(status?: RSVP): Exclude<RSVP, "MAYBE"> {
  return status === "MAYBE" || !status ? "PENDING" : status;
}
