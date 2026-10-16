export type PartyRole = "PADRINHO" | "MADRINHA";
export interface Promotion {
  cycle_id: string;
  guest_id: string;
  role: PartyRole;
  accepted_at: string | null;
  completed_at: string | null;
}
export interface PartyState {
  promotion: Promotion | null;
  message?: string;
  attire?: string | null;
  ceremony?: string | null;
}
