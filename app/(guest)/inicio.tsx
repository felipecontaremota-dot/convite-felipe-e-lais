import { useApp } from "../../src/lib/AppProvider";
import { GuestHome } from "../../src/features/GuestScreens";
import { CeremonialHome } from "../../src/features/ceremonial/HomeScreen";
export default function Home() {
  return useApp().data?.role === "CEREMONIALIST" ? (
    <CeremonialHome />
  ) : (
    <GuestHome />
  );
}
