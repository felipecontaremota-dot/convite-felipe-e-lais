import { useApp } from "../../src/lib/AppProvider";
import { PartyScreen } from "../../src/features/weddingParty/PartyScreen";
import { PartyListScreen } from "../../src/features/ceremonial/PartyListScreen";
export default function WeddingParty() {
  const role = useApp().data?.role;
  return role === "ADMIN" || role === "CEREMONIALIST" ? (
    <PartyListScreen />
  ) : (
    <PartyScreen />
  );
}
