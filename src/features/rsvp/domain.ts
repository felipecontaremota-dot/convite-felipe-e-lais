import type { RsvpRecord, RSVP } from "../../types/domain";
export function effectiveRsvpStatus(record?: Partial<RsvpRecord>): RSVP {
  // Before 007 the guest's explicit “Ainda vou decidir” was saved as PENDING + APP response.
  if (
    record?.status === "PENDING" &&
    record.responded_at &&
    record.source === "APP"
  )
    return "MAYBE";
  return record?.status || "PENDING";
}
