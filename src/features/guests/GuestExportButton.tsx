import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { AdminModal } from "../../components/AdminModal";
import { Button, Toggle, styles } from "../../components/ui";
import { theme } from "../../theme/tokens";
import { useApp } from "../../lib/AppProvider";
import { eventId } from "../../lib/supabase";
import { guestExportFilename } from "./guestExport";

import {
  exportFilterColumns,
  filteredGuestExportRows,
  toggleExportFilter,
  type ExportFilter,
} from "./guestExportFilters";

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
export function GuestExportButton() {
  const { width } = useWindowDimensions();
  const [step, setStep] = useState<"filters" | "format">("filters");
  const [selected, setSelected] = useState<ExportFilter[]>([]);
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
  const rows = filteredGuestExportRows(app.data, selected);
  const generate = async (format: "xlsx" | "pdf") => {
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
      const blob =
        format === "xlsx"
          ? await (await import("./guestWorkbook")).guestWorkbook(rows, date)
          : (await import("./guestPdf")).guestPdf(rows, date);
      const { downloadGuestWorkbook } = await import("./guestWorkbook");
      if (
        !active.current ||
        latest.current.scope !== scope ||
        latest.current.data?.role !== "ADMIN" ||
        latest.current.data.event.id !== eventId
      )
        return;
      downloadGuestWorkbook(
        blob,
        guestExportFilename(date).replace(/xlsx$/, format),
      );
      setNotice(
        `Arquivo ${format === "xlsx" ? "Excel" : "PDF"} gerado. Download iniciado.`,
      );
      setOpen(false);
    } catch {
      if (active.current)
        setError(
          rows.length
            ? `Não foi possível gerar o ${format === "xlsx" ? "Excel" : "PDF"}. Tente novamente.`
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
          setSelected([]);
          setStep("filters");
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
          title={
            step === "filters"
              ? "Filtrar lista de convidados"
              : "Baixar lista de convidados"
          }
          contentWidth={step === "filters" ? 900 : 420}
          onClose={() => setOpen(false)}
          dismissible={!busy}
        >
          {step === "filters" ? (
            <>
              <Text style={styles.text}>
                Selecione quais convidados deseja incluir no arquivo.
              </Text>
              <View
                style={{
                  flexDirection: width >= 700 ? "row" : "column",
                  gap: 12,
                }}
              >
                {exportFilterColumns.map((column, index) => (
                  <View key={index} style={{ flex: 1, gap: 8, minWidth: 0 }}>
                    {column.map((label) => (
                      <Toggle
                        key={label}
                        label={label}
                        value={selected.includes(label)}
                        onChange={() =>
                          setSelected((current) =>
                            toggleExportFilter(current, label),
                          )
                        }
                      />
                    ))}
                  </View>
                ))}
              </View>
              <Text role="status" style={styles.small}>
                {rows.length} convidados encontrados
              </Text>
              {selected.length > 0 && !rows.length ? (
                <Text role="status" style={styles.text}>
                  Nenhum convidado corresponde aos filtros selecionados.
                </Text>
              ) : null}
              <Button
                title="Cancelar"
                secondary
                onPress={() => setOpen(false)}
              />
              <Button
                title="Continuar"
                disabled={!selected.length || !rows.length}
                onPress={() => setStep("format")}
              />
            </>
          ) : (
            <>
              <Text style={styles.text}>
                {rows.length} convidados serão exportados.
              </Text>
              <View
                style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
              >
                <Icon kind="excel" />
                <View style={{ flex: 1 }}>
                  <Button
                    title={busy ? "Gerando Excel…" : "Excel (.xlsx)"}
                    onPress={() => generate("xlsx")}
                    disabled={busy || !rows.length}
                  />
                </View>
              </View>
              <View
                style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
              >
                <Icon kind="pdf" />
                <View style={{ flex: 1 }}>
                  <Button
                    title={busy ? "Gerando PDF…" : "PDF (.pdf)"}
                    onPress={() => generate("pdf")}
                    disabled={busy || !rows.length}
                    secondary
                  />
                </View>
              </View>
              <Button
                title="Voltar aos filtros"
                secondary
                disabled={busy}
                onPress={() => setStep("filters")}
              />
            </>
          )}
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
