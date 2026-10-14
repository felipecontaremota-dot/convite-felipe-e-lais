import { Screen } from "../../components/ui";
import { GuestMessages } from "./GuestMessages";
export function MessagesScreen() {
  return (
    <Screen section="guest" title="Uma mensagem aos noivos">
      <GuestMessages />
    </Screen>
  );
}
