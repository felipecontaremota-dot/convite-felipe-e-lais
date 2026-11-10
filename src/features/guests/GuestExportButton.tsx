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
import * as api from "../../repositories/api";
import * as demo from "../../repositories/demo";
import {
  canExportGuests,
  type GuestExportData,
  guestExportFilename,
} from "./guestExport";

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
  const app = useApp();
  return <ScopedGuestExport key={`${app.scope}:${app.data?.role}`} />;
}
function ScopedGuestExport() {
  const { width } = useWindowDimensions();
  const [step, setStep] = useState<"filters" | "format">("filters");
  const [selected, setSelected] = useState<ExportFilter[]>([]);
  const app = useApp();
  const [exportData, setExportData] = useState<{
    scope: string;
    data: GuestExportData;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const epoch = useRef(0);
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
  const close = () => {
    epoch.current++;
    setOpen(false);
    setExportData(null);
    setLoading(false);
  };
  if (
    Platform.OS !== "web" ||
    !canExportGuests(app.data?.role) ||
    app.data?.event.id !== eventId
  )
    return null;
  const source =
    app.data!.role === "ADMIN"
      ? app.data!
      : exportData?.scope === app.scope
        ? exportData.data
        : null;
  const rows = source ? filteredGuestExportRows(source, selected) : [];
  const loadExport = async () => {
    const scope = app.scope;
    const attempt = ++epoch.current;
    setExportData(null);
    setLoading(true);
    setError("");
    try {
      if (!app.online) throw Error("offline");
      const data = app.isDemo
        ? await demo.demoGuestListExport()
        : await api.guestListExport();
      if (
        active.current &&
        epoch.current === attempt &&
        latest.current.scope === scope &&
        latest.current.data?.role === "CEREMONIALIST" &&
        data.role === "CEREMONIALIST" &&
        data.event.id === eventId
      )
        setExportData({ scope, data });
    } catch {
      if (active.current && epoch.current === attempt)
        setError(
          "Não foi possível carregar a lista para exportação. Conecte-se e tente novamente.",
        );
    } finally {
      if (active.current && epoch.current === attempt) setLoading(false);
    }
  };
  const generate = async (format: "xlsx" | "pdf") => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const scope = app.scope;
    const role = app.data!.role;
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
        latest.current.data?.role !== role ||
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
      close();
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
        disabled={
          busy || loading || (app.data?.role === "CEREMONIALIST" && !app.online)
        }
        onPress={() => {
          setError("");
          setSelected([]);
          setStep("filters");
          setOpen(true);
          if (app.data?.role === "CEREMONIALIST") void loadExport();
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
          onClose={close}
          dismissible={!busy}
        >
          {loading ? (
            <Text style={styles.text}>Carregando lista para exportação…</Text>
          ) : null}
          {app.data?.role === "CEREMONIALIST" ? (
            <Text style={styles.small}>
              Contatos, links individuais e senhas são restritos aos noivos e
              não serão incluídos.
            </Text>
          ) : null}
          {error && !source ? (
            <Button
              title="Tentar carregar lista novamente"
              onPress={loadExport}
              disabled={loading}
            />
          ) : null}
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
              <Button title="Cancelar" secondary onPress={close} />
              <Button
                title="Continuar"
                disabled={loading || !selected.length || !rows.length}
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
