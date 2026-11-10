import { theme } from "../../theme/tokens";
export const guestNoteStyle = {
  color: theme.colors.card,
  backgroundColor: theme.colors.destructive,
  borderRadius: 14,
  minWidth: 28,
  textAlign: "center" as const,
  padding: 4,
  fontWeight: "800" as const,
  fontSize: 17,
};
