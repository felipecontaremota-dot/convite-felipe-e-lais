import { Text } from "react-native";
import { Card, styles } from "../../components/ui";
export function NotificationPreferences({ guestId }: { guestId: string }) {
  return (
    <Card>
      <Text style={styles.small}>
        Preferências de notificações do convite disponíveis na versão web.
      </Text>
    </Card>
  );
}
