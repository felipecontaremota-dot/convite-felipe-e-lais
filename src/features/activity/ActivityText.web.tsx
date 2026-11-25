import { useState } from "react";
import { theme } from "../../theme/tokens";
import { activitySentence, type GuestActivity } from "./domain";
export function ActivityText({
  activity,
  canEdit,
  onEdit,
}: {
  activity: GuestActivity;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const message = activitySentence(activity);
  const [hovered, setHovered] = useState(false);
  return (
    <p
      style={{
        margin: 0,
        color: theme.colors.muted,
        fontFamily:
          '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
        fontSize: 16,
        lineHeight: "25px",
        overflowWrap: "anywhere",
      }}
    >
      {message.prefix}
      {canEdit ? (
        <button
          type="button"
          aria-label={`Editar convidado ${message.subject}`}
          onClick={onEdit}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: "inline",
            border: 0,
            padding: 0,
            borderRadius: 4,
            font: "inherit",
            lineHeight: "inherit",
            textAlign: "left",
            color: theme.colors.primary,
            background: hovered ? theme.colors.wash : "transparent",
            textDecoration: "underline",
            cursor: "pointer",
            overflowWrap: "anywhere",
          }}
        >
          {message.subject}
        </button>
      ) : (
        message.subject
      )}
      {message.action}
      {message.status ? (
        <strong style={{ color: message.color, fontWeight: 700 }}>
          {message.status}
        </strong>
      ) : null}
      {message.suffix}
    </p>
  );
}
