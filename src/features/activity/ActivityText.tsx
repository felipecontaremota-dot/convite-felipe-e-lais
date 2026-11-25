import { Text } from "react-native";
import { styles } from "../../components/ui";
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
  return (
    <Text style={styles.text}>
      {message.prefix}
      {canEdit ? (
        <Text
          accessibilityRole="button"
          accessibilityLabel={`Editar convidado ${message.subject}`}
          onPress={onEdit}
          style={{
            color: theme.colors.primary,
            textDecorationLine: "underline",
          }}
        >
          {message.subject}
        </Text>
      ) : (
        message.subject
      )}
      {message.action}
      {message.status ? (
        <Text style={{ color: message.color, fontWeight: "700" }}>
          {message.status}
        </Text>
      ) : null}
      {message.suffix}
    </Text>
  );
}
