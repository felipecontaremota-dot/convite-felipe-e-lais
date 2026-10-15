import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { AdminModal } from "../../components/AdminModal";
import { Button, styles } from "../../components/ui";
import { theme } from "../../theme/tokens";
import { useApp } from "../../lib/AppProvider";
import { eventId } from "../../lib/supabase";
import { guestExportFilename, guestExportRows } from "./guestExport";

const paths = {
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  excel: "M4 3h16v18H4zM4 9h16M4 15h16M10 3v18",
  pdf: "M5 3h9l5 5v13H5zM14 3v6h5",
};
function Icon({ kind }: { kind: keyof typeof paths }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" aria-hidden={true}>
      <Path
        d={paths[kind]}
        fill="none"
        stroke={theme.colors.secondary}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
export function GuestExportButton({
  search,
  filter,
}: {
  search: string;
  filter: string;
}) {
  const app = useApp();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false),
    active = useRef(true),
    latest = useRef(app);
  useLayoutEffect(() => {
    latest.current = app;
  }, [app]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  if (
    Platform.OS !== "web" ||
    app.data?.role !== "ADMIN" ||
    app.data.event.id !== eventId
  )
    return null;
  const rows = guestExportRows(app.data, search, filter);
  const generate = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const scope = app.scope;
    try {
      if (!rows.length)
        throw Error("Nenhum convidado encontrado para exportação.");
      const date = new Date();
      const { guestWorkbook, downloadGuestWorkbook } =
        await import("./guestWorkbook");
      const blob = await guestWorkbook(rows, date);
      if (
        !active.current ||
        latest.current.scope !== scope ||
        latest.current.data?.role !== "ADMIN" ||
        latest.current.data.event.id !== eventId
      )
        return;
      downloadGuestWorkbook(blob, guestExportFilename(date));
      setNotice("Arquivo Excel gerado. Download iniciado.");
      setOpen(false);
    } catch {
      if (active.current)
        setError(
          rows.length
            ? "Não foi possível gerar o Excel. Tente novamente."
            : "Nenhum convidado encontrado para exportação.",
        );
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Baixar lista de convidados"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={busy}
        onPress={() => {
          setError("");
          setOpen(true);
        }}
        {...(Platform.OS === "web"
          ? { dataSet: { themeButton: "secondary" } }
          : {})}
        style={[styles.button, { backgroundColor: theme.colors.wash }]}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon kind="download" />
          <Text
            style={{
              color: theme.colors.secondary,
              fontSize: 15,
              fontWeight: "600",
              flexShrink: 1,
            }}
          >
            Baixar lista de convidados
          </Text>
        </View>
      </Pressable>
      {notice ? (
        <Text role="status" style={styles.small}>
          {notice}
        </Text>
      ) : null}
      {open ? (
        <AdminModal
          title="Baixar lista de convidados"
          contentWidth={420}
          onClose={() => setOpen(false)}
          dismissible={!busy}
        >
          <Text style={styles.text}>
            {rows.length
              ? `${rows.length} convidados serão exportados${search || filter !== "ALL" ? " conforme a seleção atual" : ""}.`
              : "Nenhum convidado encontrado para exportação."}
          </Text>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Icon kind="excel" />
            <View style={{ flex: 1 }}>
              <Button
                title={busy ? "Gerando Excel…" : "Excel (.xlsx)"}
                onPress={generate}
                disabled={busy || !rows.length}
              />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Icon kind="pdf" />
            <View style={{ flex: 1 }}>
              <Button
                title="PDF (.pdf) — Em breve"
                onPress={() => {}}
                disabled
                secondary
              />
            </View>
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
        </AdminModal>
      ) : null}
    </>
  );
}
