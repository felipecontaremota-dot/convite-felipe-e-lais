import { Text } from "react-native";
import { styles } from "../../components/ui";
export function ReminderPreview({ text }: { html: string; text: string }) {
  return <Text style={styles.text}>{text}</Text>;
}
