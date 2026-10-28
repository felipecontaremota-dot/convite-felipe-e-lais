import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../../lib/AppProvider";
import {
  Button,
  Card,
  Choice,
  Empty,
  Field,
  Screen,
  Toggle,
  styles,
} from "../../components/ui";
import { AdminModal, ConfirmModal } from "../../components/AdminModal";
import { Select } from "../../components/adminUi";
import { theme } from "../../theme/tokens";
import * as api from "../../repositories/api";
import { id } from "../../repositories/demo";
import {
  planningDate,
  PlanningEditor,
  recordValue,
  type EditorKind,
} from "./PlanningEditor";
import { demoPlanning, demoPlanningAction } from "./demo";
import { PlanningHistory } from "./PlanningHistory";
import { downloadDocument, uploadDocument } from "./documents";
import {
  addDays,
  contractStates,
  day,
  ledger,
  money,
  maskDate,
  timestamp,
  todaySP,
  type Entry,
  type LedgerRecord,
  type PlanningData,
  type PlanningDocument,
} from "./domain";
const tabs = [
  { value: "overview", label: "Visão geral" },
  { value: "suppliers", label: "Fornecedores" },
  { value: "entries", label: "Despesas e contratos" },
  { value: "payments", label: "Pagamentos" },
  { value: "documents", label: "Documentos" },
];
const demoFiles = new Map<string, Blob>();
export function PlanningScreen() {
  const app = useApp();
  return (
    <Screen title="Planejamento do Casamento" section="admin">
      {app.data?.role === "ADMIN" ? <PlanningContent key={app.scope} /> : null}
    </Screen>
  );
}
function Progress({ value }: { value: number }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Percentual quitado"
      accessibilityValue={{ min: 0, max: 100, now: value }}
      style={{
        height: 10,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: theme.colors.wash,
      }}
    >
      <View
        style={{
          height: 10,
          width: `${value}%`,
          backgroundColor: theme.colors.primary,
        }}
      />
    </View>
  );
}
function PlanningContent() {
  const app = useApp(),
    client = useQueryClient(),
    event = app.data!.event.id;
  const [today, setToday] = useState(todaySP);
  useEffect(() => {
    const timer = setInterval(() => setToday(todaySP()), 60000);
    return () => clearInterval(timer);
  }, []);
  const key = ["planning", app.scope];
  const query = useQuery({
    queryKey: key,
    queryFn: () => (app.isDemo ? demoPlanning(event) : api.planningSnapshot()),
    retry: false,
    refetchInterval: app.online ? 30000 : false,
    enabled: app.online,
  });
  const active = useRef(true),
    urls = useRef<string[]>([]),
    lock = useRef(false);
  useEffect(() => {
    active.current = true;
    const registry = urls.current;
    return () => {
      active.current = false;
      registry.forEach((u) => URL.revokeObjectURL(u));
      client.removeQueries({ queryKey: ["planning", app.scope] });
      client.removeQueries({ queryKey: ["planning-history", app.scope] });
    };
  }, [client, app.scope]);
  const [tab, setTab] = useState("overview"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [editor, setEditor] = useState<{
    kind: EditorKind;
    record?: ReturnType<typeof recordValue>;
    entryId?: string;
  } | null>(null);
  const [detail, setDetail] = useState<string | null>(null),
    [supplierDetail, setSupplierDetail] = useState<string | null>(null),
    [detailTab, setDetailTab] = useState("general");
  const [confirm, setConfirm] = useState<{
    kind: string;
    record: LedgerRecord;
    request: string;
  } | null>(null);
  const [upload, setUpload] = useState<{
    supplier_id?: string;
    entry_id?: string;
    payment_id?: string;
  } | null>(null);
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(
    null,
  );
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [supplier, setSupplier] = useState(""),
    [kind, setKind] = useState(""),
    [status, setStatus] = useState(""),
    [financial, setFinancial] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [archived, setArchived] = useState(false),
    [period, setPeriod] = useState("30"),
    [paymentFilter, setPaymentFilter] = useState("ALL");
  const data = query.data;
  const change = async (
    kind: string,
    identifier: string,
    version: number | null,
    values: Record<string, unknown>,
    request: string,
  ) => {
    if (lock.current) throw Error("Uma operação está em andamento.");
    if (!app.online || app.data?.role !== "ADMIN")
      throw Error("Conecte-se para salvar o planejamento.");
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (app.isDemo)
        demoPlanningAction(event, kind, identifier, version, values);
      else await api.planningAction(kind, identifier, version, values, request);
      await query.refetch({ throwOnError: true });
      await client.invalidateQueries({
        queryKey: ["planning-history", app.scope],
      });
      if (active.current) setNotice("Planejamento atualizado.");
    } catch (failure) {
      await query.refetch();
      throw failure;
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  const archive = (kind: string, record: LedgerRecord) =>
    setConfirm({ kind: `${kind}_ARCHIVE`, record, request: id() });
  const edit = (kind: EditorKind, record?: object, entryId?: string) =>
    setEditor({ kind, record: recordValue(record), entryId });
  const openEntry = (entry: Entry) => {
    setDetail(entry.id);
    setDetailTab("general");
  };
  const prepareDocument = useCallback(
    async (doc: PlanningDocument) => {
      setError("");
      try {
        const blob = app.isDemo
          ? demoFiles.get(doc.id)
          : await downloadDocument(doc);
        if (!blob)
          throw Error(
            "Arquivo de demonstração disponível apenas na sessão em que foi anexado.",
          );
        if (!active.current) return;
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        setPreview({ id: doc.id, url });
      } catch (e) {
        if (active.current)
          setError(e instanceof Error ? e.message : "Documento indisponível.");
      }
    },
    [app.isDemo],
  );
  if (query.isPending)
    return (
      <>
        <Text style={styles.text}>
          {app.online
            ? "Carregando planejamento…"
            : "Conecte-se para carregar o planejamento."}
        </Text>
        <Button
          title="Carregar dados novamente"
          secondary
          disabled={!app.online}
          onPress={() => query.refetch()}
        />
      </>
    );
  if (!data || query.isError)
    return (
      <>
        <Text role="alert" style={styles.error}>
          Não foi possível carregar o planejamento. Confira sua conexão e
          autorização administrativa.
        </Text>
        <Button
          title="Carregar dados novamente"
          onPress={() => query.refetch()}
          disabled={!app.online}
        />
      </>
    );
  const totals = ledger(data, today),
    current = totals.items.find((i) => i.entry.id === detail),
    vendor = data.suppliers.find((s) => s.id === supplierDetail);
  const vendorName = (identifier: string | null) =>
    data.suppliers.find((s) => s.id === identifier)?.name || "Sem fornecedor";
  let dateFrom: string | null = null,
    dateTo: string | null = null,
    dateError = "";
  try {
    dateFrom = planningDate(from);
    dateTo = planningDate(to);
    if (dateFrom && dateTo && dateFrom > dateTo)
      throw Error("O início do período deve ser anterior ao fim.");
  } catch (e) {
    dateError = e instanceof Error ? e.message : "Confira as datas.";
  }
  const filtered = totals.items.filter(
    (i) =>
      (archived || !i.entry.deleted_at) &&
      (!search ||
        `${i.entry.title} ${i.entry.description} ${vendorName(i.entry.supplier_id)}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR"))) &&
      (!category || i.entry.category === category) &&
      (!supplier ||
        (supplier === "NONE"
          ? !i.entry.supplier_id
          : i.entry.supplier_id === supplier)) &&
      (!kind || i.entry.kind === kind) &&
      (!status || i.entry.status === status) &&
      (!financial || i.status === financial) &&
      (paymentFilter === "ALL" ||
        (paymentFilter === "PAID"
          ? i.obligation > 0 && i.balance === 0
          : paymentFilter === "OPEN"
            ? i.balance > 0
            : i.overdue > 0)) &&
      ((!dateFrom && !dateTo) ||
        (!dateError &&
          i.installments.some(
            (p) =>
              (!dateFrom || p.due_on >= dateFrom) &&
              (!dateTo || p.due_on <= dateTo),
          ))),
  );
  const documents = (target?: {
    supplier_id?: string;
    entry_id?: string;
    payment_id?: string;
  }) => (
    <>
      <Button
        title="Anexar documento"
        secondary
        disabled={busy || !app.online}
        onPress={() => setUpload(target || {})}
      />
      {data.documents
        .filter(
          (d) =>
            !target ||
            Object.entries(target).some(([k, v]) => d[k as "entry_id"] === v),
        )
        .map((d) => (
          <Card key={d.id}>
            <Text style={styles.text}>{d.name}</Text>
            <Text style={styles.small}>
              {timestamp(d.created_at)} · {Math.ceil(d.size_bytes / 1024)} KB
              {d.state === "PENDING" ? " · Envio pendente" : ""}
              {d.deleted_at ? " · Excluído" : ""}
            </Text>
            {!d.deleted_at ? (
              <>
                <Button
                  disabled={d.state !== "READY"}
                  title={`Preparar documento: ${d.name}`}
                  secondary
                  onPress={() => prepareDocument(d)}
                />
                {preview?.id === d.id && Platform.OS === "web"
                  ? React.createElement(
                      "a",
                      {
                        href: preview.url,
                        download: d.name,
                        style: { color: theme.colors.secondary, padding: 12 },
                      },
                      "Baixar documento",
                    )
                  : null}
                {preview?.id === d.id && Platform.OS === "web"
                  ? React.createElement(
                      "a",
                      {
                        href: preview.url,
                        target: "_blank",
                        rel: "noopener noreferrer",
                        style: { color: theme.colors.secondary, padding: 12 },
                      },
                      "Visualizar documento",
                    )
                  : null}
                <Button
                  title="Editar identificação do documento"
                  secondary
                  disabled={busy || !app.online}
                  onPress={() => edit("DOCUMENT", d)}
                />
                <Button
                  title={`Excluir documento: ${d.name}`}
                  secondary
                  disabled={busy || !app.online}
                  onPress={() => archive("DOCUMENT", d)}
                />
              </>
            ) : null}
          </Card>
        ))}
      {!data.documents.some(
        (d) =>
          !d.deleted_at &&
          (!target ||
            Object.entries(target).some(([k, v]) => d[k as "entry_id"] === v)),
      ) ? (
        <Empty text="Nenhum documento anexado." />
      ) : null}
    </>
  );
  const history = (identifier?: string) => (
    <PlanningHistory identifier={identifier} />
  );
  const payments = (entryId?: string) => (
    <>
      {data.payments
        .filter((p) => !entryId || p.entry_id === entryId)
        .map((p) => (
          <Card key={p.id}>
            <Text style={styles.text}>
              {data.entries.find((e) => e.id === p.entry_id)?.title} ·{" "}
              {money(p.amount_cents)}
            </Text>
            <Text style={styles.small}>
              {p.supplier_name || "Sem fornecedor no registro"} ·{" "}
              {day(p.paid_on)} · {p.method} ·{" "}
              {
                data.installments.find((i) => i.id === p.installment_id)
                  ?.description
              }
              {p.deleted_at ? " · Registro cancelado" : ""}
            </Text>
            {p.notes ? <Text style={styles.text}>{p.notes}</Text> : null}
            {!p.deleted_at ? (
              <>
                <Button
                  title="Editar pagamento"
                  secondary
                  disabled={busy || !app.online}
                  onPress={() => edit("PAYMENT", p, p.entry_id)}
                />
                <Button
                  title="Anexar comprovante"
                  secondary
                  disabled={busy || !app.online}
                  onPress={() => setUpload({ payment_id: p.id })}
                />
                <Button
                  title="Cancelar registro de pagamento"
                  secondary
                  disabled={busy || !app.online}
                  onPress={() => archive("PAYMENT", p)}
                />
              </>
            ) : null}
          </Card>
        ))}
      {!data.payments.some((p) => !entryId || p.entry_id === entryId) ? (
        <Empty text="Nenhum pagamento registrado." />
      ) : null}
    </>
  );
  return (
    <>
      <Text style={styles.text}>
        Acompanhe fornecedores, contratos, despesas e pagamentos do nosso grande
        dia.
      </Text>
      {!app.online ? (
        <Text role="alert" style={styles.notice}>
          Sem conexão. Alterações financeiras não são enviadas para filas
          offline.
        </Text>
      ) : null}
      {notice ? (
        <Text role="status" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
      {error ? (
        <Text role="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button
        title="Atualizar planejamento"
        secondary
        disabled={!app.online || busy}
        onPress={() => query.refetch()}
      />
      <Choice value={tab} options={tabs} onChange={setTab} />
      <Text style={styles.small}>
        Indicadores globais do evento. Os filtros abaixo afetam somente as
        listas. Incluem obrigações e pagamentos de lançamentos arquivados.
      </Text>
      <View style={[styles.row, { alignItems: "stretch" }]}>
        {[
          ["Orçamento previsto", money(totals.budget ?? totals.planned)],
          ["Total contratado/comprometido", money(totals.committed)],
          ["Total pago", money(totals.paid)],
          ["Saldo a pagar", money(totals.balance)],
          ["Pagamentos vencidos", money(totals.overdue)],
          [
            "Próximos pagamentos",
            `${totals.future.length} · ${money(totals.futureAmount)}`,
          ],
        ].map(([label, value]) => (
          <View
            key={label}
            style={{ flexGrow: 1, flexBasis: 220, minWidth: 0 }}
          >
            <Card>
              <Text style={styles.small}>{label}</Text>
              <Text style={styles.heading}>{value}</Text>
            </Card>
          </View>
        ))}
      </View>
      <Progress value={totals.percent} />
      <Text style={styles.small}>
        {totals.percent}% quitado · {100 - totals.percent}% pendente do valor
        comprometido.
      </Text>
      {totals.credit > 0 ? (
        <Text role="alert" style={styles.notice}>
          Crédito ou reembolso a conciliar: {money(totals.credit)}. Não reduz o
          saldo de outros contratos.
        </Text>
      ) : null}
      {tab === "overview" ? (
        <>
          <Card>
            <Text style={styles.heading}>Orçamento do casamento</Text>
            <Text style={styles.text}>
              Orçamento global:{" "}
              {totals.budget === null
                ? "Ainda não definido"
                : money(totals.budget)}
            </Text>
            <Text style={styles.text}>
              Projeção dos lançamentos: {money(totals.planned)}
            </Text>
            <Text style={styles.text}>
              Disponível para novas contratações:{" "}
              {totals.available === null
                ? "Defina o orçamento"
                : money(totals.available)}
            </Text>
            <Text style={styles.text}>
              Orçamento utilizado:{" "}
              {totals.used === null ? "—" : `${totals.used}%`}
            </Text>
            {totals.exceeded > 0 ? (
              <Text style={styles.error}>
                Excedente: {money(totals.exceeded)}
              </Text>
            ) : null}
            <Button
              title="Definir orçamento"
              secondary
              disabled={busy || !app.online}
              onPress={() => edit("BUDGET", data.budget || undefined, event)}
            />
          </Card>
          <Button
            title="Nova despesa ou contratação"
            onPress={() => edit("ENTRY")}
            disabled={busy || !app.online}
          />
          <Text style={styles.heading}>Próximos vencimentos</Text>
          <Text style={styles.small}>
            Vencimentos e pagamentos usam datas distintas. Horário de Brasília.
          </Text>
          <Choice
            value={period}
            onChange={setPeriod}
            options={[
              { value: "overdue", label: "Vencidos" },
              { value: "7", label: "7 dias" },
              { value: "15", label: "15 dias" },
              { value: "30", label: "30 dias" },
              { value: "future", label: "Futuros" },
            ]}
          />
          {totals.due
            .filter((p) =>
              period === "overdue"
                ? p.due_on < today
                : p.due_on >= today &&
                  (period === "future" ||
                    p.due_on <= addDays(today, Number(period))),
            )
            .map((p) => (
              <Card key={p.id}>
                <Text style={styles.text}>
                  {p.entry.title} · {vendorName(p.entry.supplier_id)}
                </Text>
                <Text style={p.due_on < today ? styles.error : styles.text}>
                  {p.description} · {day(p.due_on)} · {money(p.due)} ·{" "}
                  {p.status}
                </Text>
                <Button
                  title="Abrir lançamento"
                  secondary
                  onPress={() => openEntry(p.entry)}
                />
              </Card>
            ))}
          {!totals.due.length ? (
            <Empty text="Nenhum vencimento pendente. Cadastre despesas e seu cronograma para iniciar." />
          ) : null}
          <Text style={styles.heading}>Histórico do planejamento</Text>
          {history()}
        </>
      ) : null}
      {tab === "suppliers" ? (
        <>
          <Button
            title="Cadastrar fornecedor"
            disabled={busy || !app.online}
            onPress={() => edit("SUPPLIER")}
          />
          <Toggle
            label="Mostrar fornecedores arquivados"
            value={archived}
            onChange={setArchived}
          />
          {data.suppliers
            .filter((s) => archived || !s.deleted_at)
            .map((s) => (
              <Card key={s.id}>
                <Text style={styles.heading}>
                  {s.name}
                  {s.deleted_at ? " · Arquivado" : ""}
                </Text>
                <Text style={styles.small}>
                  {s.category} ·{" "}
                  {
                    data.entries.filter(
                      (e) => e.supplier_id === s.id && !e.deleted_at,
                    ).length
                  }{" "}
                  lançamentos
                </Text>
                <Button
                  title={`Detalhes de ${s.name}`}
                  secondary
                  onPress={() => setSupplierDetail(s.id)}
                />
              </Card>
            ))}
          {!data.suppliers.some((s) => !s.deleted_at) ? (
            <Empty text="Cadastre seu primeiro fornecedor. Despesas avulsas também podem ser registradas sem fornecedor." />
          ) : null}
        </>
      ) : null}
      {tab === "entries" ? (
        <>
          <Button
            title="Nova despesa ou contratação"
            disabled={busy || !app.online}
            onPress={() => edit("ENTRY")}
          />
          <Field
            label="Buscar fornecedor, serviço ou despesa"
            value={search}
            onChangeText={setSearch}
          />
          <Select
            label="Filtrar categoria"
            value={category}
            onChange={setCategory}
            options={[
              { value: "", label: "Todas as categorias" },
              ...[
                ...new Set(data.entries.map((e) => e.category).filter(Boolean)),
              ]
                .sort()
                .map((v) => ({ value: v, label: v })),
            ]}
          />
          <Select
            label="Filtrar fornecedor"
            value={supplier}
            onChange={setSupplier}
            options={[
              { value: "", label: "Todos os fornecedores" },
              { value: "NONE", label: "Sem fornecedor" },
              ...data.suppliers.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <Select
            label="Filtrar tipo de lançamento"
            value={kind}
            onChange={setKind}
            options={[
              { value: "", label: "Todos os tipos" },
              { value: "SERVICE", label: "Serviço" },
              { value: "EXPENSE", label: "Despesa avulsa" },
            ]}
          />
          <Select
            label="Filtrar situação contratual"
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: "Todas as situações" },
              ...Object.entries(contractStates).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
          <Select
            label="Filtrar situação financeira"
            value={financial}
            onChange={setFinancial}
            options={[
              { value: "", label: "Todas as situações financeiras" },
              ...[
                "Pago",
                "Pendente",
                "Parcialmente pago",
                "Vencido",
                "Cancelado",
              ].map((v) => ({ value: v, label: v })),
            ]}
          />
          <Select
            label="Filtrar pagamentos"
            value={paymentFilter}
            onChange={setPaymentFilter}
            options={[
              { value: "ALL", label: "Todos os pagamentos" },
              { value: "PAID", label: "Pagos" },
              { value: "OPEN", label: "Pendentes (qualquer saldo em aberto)" },
              { value: "OVERDUE", label: "Vencidos" },
            ]}
          />
          <Field
            label="Vencimento a partir de (DD/MM/AAAA)"
            value={from}
            onChangeText={(v) => setFrom(maskDate(v))}
          />
          <Field
            label="Vencimento até (DD/MM/AAAA)"
            value={to}
            onChangeText={(v) => setTo(maskDate(v))}
          />
          {dateError ? (
            <Text role="alert" style={styles.error}>
              {dateError}
            </Text>
          ) : null}
          <Toggle
            label="Mostrar lançamentos arquivados"
            value={archived}
            onChange={setArchived}
          />
          {filtered.map((i) => (
            <Card key={i.entry.id}>
              <Text style={styles.heading}>{i.entry.title}</Text>
              <Text style={styles.small}>
                {i.entry.category} · {vendorName(i.entry.supplier_id)} ·{" "}
                {contractStates[i.entry.status]}
                {i.entry.deleted_at ? " · Arquivado" : ""}
              </Text>
              <Text style={styles.text}>
                Valor final:{" "}
                {money(i.entry.agreed_cents - i.entry.discount_cents)} · Pago:{" "}
                {money(i.paid)} · Saldo: {money(i.balance)}
              </Text>
              <Text style={styles.text}>
                {i.status} · Próximo vencimento:{" "}
                {day(i.installments.find((p) => p.due > 0)?.due_on || null)}
              </Text>
              <Progress value={i.percent} />
              <Button
                title={`Abrir ${i.entry.title}`}
                secondary
                onPress={() => openEntry(i.entry)}
              />
            </Card>
          ))}
          {!filtered.length ? (
            <Empty text="Nenhum lançamento corresponde aos filtros. Cadastre uma despesa ou ajuste a pesquisa." />
          ) : null}
        </>
      ) : null}
      {tab === "payments" ? (
        <>
          <Button
            title="Registrar pagamento"
            disabled={busy || !app.online}
            onPress={() => edit("PAYMENT")}
          />
          <Text style={styles.small}>
            Cadastre uma parcela no lançamento para registrar entradas,
            quitações parciais, antecipações ou pagamentos complementares.
          </Text>
          {payments()}
        </>
      ) : null}
      {tab === "documents" ? documents() : null}
      {current ? (
        <AdminModal
          title={current.entry.title}
          onClose={() => setDetail(null)}
          contentWidth={880}
        >
          <Choice
            value={detailTab}
            onChange={setDetailTab}
            options={[
              { value: "general", label: "Dados gerais" },
              { value: "financial", label: "Informações financeiras" },
              { value: "payments", label: "Pagamentos" },
              { value: "documents", label: "Documentos" },
              { value: "history", label: "Histórico" },
            ]}
          />
          {detailTab === "general" ? (
            <>
              <Text style={styles.text}>
                {current.entry.kind === "SERVICE"
                  ? "Contratação de serviço"
                  : "Despesa avulsa"}{" "}
                · {current.entry.category}
              </Text>
              <Text style={styles.text}>
                {vendorName(current.entry.supplier_id)} ·{" "}
                {contractStates[current.entry.status]}
              </Text>
              <Text style={styles.text}>{current.entry.description}</Text>
              <Text style={styles.small}>
                Contratação: {day(current.entry.contracted_on)} ·
                Execução/entrega: {day(current.entry.delivery_on)}
              </Text>
              <Text style={styles.text}>{current.entry.notes}</Text>
              {current.entry.deleted_at ? (
                <Button
                  title="Editar lançamento arquivado"
                  secondary
                  disabled={busy || !app.online}
                  onPress={() => edit("ENTRY", current.entry)}
                />
              ) : null}
              {!current.entry.deleted_at ? (
                <>
                  <Button
                    title="Editar lançamento"
                    secondary
                    disabled={busy || !app.online}
                    onPress={() => edit("ENTRY", current.entry)}
                  />
                  <Button
                    title="Arquivar lançamento"
                    secondary
                    disabled={busy || !app.online}
                    onPress={() => archive("ENTRY", current.entry)}
                  />
                </>
              ) : null}
            </>
          ) : null}
          {detailTab === "financial" ? (
            <>
              <Text style={styles.text}>
                Previsto: {money(current.entry.estimated_cents)} · Contratado:{" "}
                {money(current.entry.agreed_cents)} · Desconto:{" "}
                {money(current.entry.discount_cents)}
              </Text>
              <Text style={styles.text}>
                Valor final:{" "}
                {money(
                  current.entry.agreed_cents - current.entry.discount_cents,
                )}{" "}
                · Obrigação atual: {money(current.obligation)}
              </Text>
              <Text style={styles.text}>
                Pago: {money(current.paid)} · Saldo: {money(current.balance)} ·
                Crédito a conciliar: {money(current.credit)}
              </Text>
              <Text style={styles.text}>
                {current.entry.payment_method} · {current.entry.financial_notes}
              </Text>
              <Progress value={current.percent} />
              {current.difference !== 0 ? (
                <Text role="alert" style={styles.notice}>
                  Diferença entre obrigação e parcelas:{" "}
                  {money(current.difference)}.{" "}
                  {current.difference > 0
                    ? "Valor ainda não distribuído; não é considerado pago."
                    : "O cronograma supera a obrigação. Ajuste as parcelas."}
                </Text>
              ) : null}
            </>
          ) : null}
          {detailTab === "payments" ? (
            <>
              {current.entry.deleted_at ? (
                <Text style={styles.notice}>
                  Lançamento arquivado: a quitação e a conciliação continuam
                  disponíveis, sem desarquivar o registro.
                </Text>
              ) : null}
              <>
                <Button
                  title="Cadastrar parcela"
                  secondary
                  disabled={busy || !app.online}
                  onPress={() =>
                    edit("INSTALLMENT", undefined, current.entry.id)
                  }
                />
                <Button
                  title="Gerar parcelas mensais"
                  secondary
                  disabled={
                    busy ||
                    !app.online ||
                    current.installments.length > 0 ||
                    (["CONTRACTED", "COMPLETED", "CANCELLED"].includes(
                      current.entry.status,
                    ) &&
                      current.balance === 0)
                  }
                  onPress={() =>
                    edit("SCHEDULE", current.entry, current.entry.id)
                  }
                />
                <Button
                  title="Registrar pagamento"
                  disabled={busy || !app.online}
                  onPress={() => edit("PAYMENT", undefined, current.entry.id)}
                />
              </>
              {current.archivedPaid > 0 ? (
                <Text style={styles.small}>
                  Pagamentos preservados de parcelas arquivadas:{" "}
                  {money(current.archivedPaid)}. Já considerados na conciliação.
                </Text>
              ) : null}
              {current.difference !== 0 ? (
                <Text role="alert" style={styles.notice}>
                  Diferença entre obrigação e parcelas:{" "}
                  {money(current.difference)}. Não é considerada paga.
                </Text>
              ) : null}
              {current.installments.some((p) => p.credit > 0) ? (
                <Text role="alert" style={styles.notice}>
                  Há pagamento superior ao valor de uma parcela. Os indicadores
                  respeitam o saldo total do lançamento; concilie a distribuição
                  do cronograma.
                </Text>
              ) : null}
              {current.installments.map((p) => (
                <Card key={p.id}>
                  <Text style={styles.heading}>{p.description}</Text>
                  <Text
                    style={p.status === "Vencido" ? styles.error : styles.text}
                  >
                    {day(p.due_on)} · {p.status}
                  </Text>
                  <Text style={styles.text}>
                    Previsto: {money(p.amount_cents)} · Pago: {money(p.paid)} ·
                    Saldo da parcela: {money(p.remaining)}
                  </Text>
                  <>
                    <Button
                      title="Editar parcela"
                      secondary
                      disabled={busy || !app.online}
                      onPress={() => edit("INSTALLMENT", p, current.entry.id)}
                    />
                    <Button
                      title="Arquivar parcela"
                      secondary
                      disabled={busy || !app.online}
                      onPress={() => archive("INSTALLMENT", p)}
                    />
                  </>
                </Card>
              ))}
              {payments(current.entry.id)}
            </>
          ) : null}
          {detailTab === "documents"
            ? documents({ entry_id: current.entry.id })
            : null}
          {detailTab === "history" ? history(current.entry.id) : null}
        </AdminModal>
      ) : null}
      {vendor ? (
        <AdminModal
          title={vendor.name}
          onClose={() => setSupplierDetail(null)}
          contentWidth={760}
        >
          <Text style={styles.text}>
            {vendor.responsible} · {vendor.category}
          </Text>
          <Text style={styles.text}>
            CPF/CNPJ: {vendor.tax_id || "—"} · {vendor.email}
          </Text>
          <Text style={styles.text}>
            {vendor.phone} · {vendor.whatsapp} · {vendor.website}
          </Text>
          <Text style={styles.text}>{vendor.address}</Text>
          <Text style={styles.heading}>Dados de pagamento</Text>
          <Text style={styles.text}>
            {vendor.pix_type} · {vendor.pix_key}
          </Text>
          <Text style={styles.text}>
            {vendor.holder_name} · {vendor.holder_tax_id} · {vendor.bank} ·{" "}
            {vendor.agency} · {vendor.account}
          </Text>
          {vendor.pix_key ? (
            <Button
              title="Copiar chave PIX"
              secondary
              onPress={async () => {
                try {
                  await Clipboard.setStringAsync(vendor.pix_key);
                  setNotice("Chave PIX copiada.");
                } catch {
                  setError(
                    "Não foi possível copiar. Selecione a chave manualmente.",
                  );
                }
              }}
            />
          ) : null}
          <Text style={styles.text}>{vendor.notes}</Text>
          <Text style={styles.small}>
            Cadastrado em {timestamp(vendor.created_at)} · Atualizado em{" "}
            {timestamp(vendor.updated_at)}
          </Text>
          <Button
            title="Editar fornecedor"
            secondary
            disabled={busy || !app.online}
            onPress={() => edit("SUPPLIER", vendor)}
          />
          <Button
            title="Arquivar fornecedor"
            secondary
            disabled={busy || !app.online || !!vendor.deleted_at}
            onPress={() => archive("SUPPLIER", vendor)}
          />
          {documents({ supplier_id: vendor.id })}
          <Text style={styles.heading}>Histórico</Text>
          {history(vendor.id)}
        </AdminModal>
      ) : null}
      {editor ? (
        <PlanningEditor
          key={`${editor.kind}-${editor.record?.id || "new"}`}
          {...editor}
          data={data}
          onSave={change}
          onClose={() => setEditor(null)}
        />
      ) : null}
      {upload ? (
        <UploadModal
          data={data}
          target={upload}
          onClose={() => setUpload(null)}
          onUpload={async (file, target, identifier, request) => {
            if (!app.online) throw Error("Conecte-se para anexar.");
            if (app.isDemo) {
              const now = new Date().toISOString();
              demoPlanningAction(event, "DOCUMENT_SAVE", identifier, null, {
                ...target,
                name: file.name,
                mime: file.type,
                size_bytes: file.size,
                state: "READY",
                created_at: now,
              });
              demoFiles.set(identifier, file);
            } else await uploadDocument(file, target, identifier, request);
            await query.refetch({ throwOnError: true });
            setNotice("Documento anexado em armazenamento privado.");
          }}
        />
      ) : null}
      {confirm ? (
        <ConfirmModal
          title={
            confirm.kind === "PAYMENT_ARCHIVE"
              ? "Cancelar registro de pagamento?"
              : "Arquivar registro?"
          }
          text={
            confirm.kind === "PAYMENT_ARCHIVE"
              ? "O registro deixará de compor o total pago, mas será preservado na auditoria. Esta ação não realiza estorno bancário. Deseja continuar?"
              : "O registro será excluído logicamente. Contratos, pagamentos, documentos e histórico vinculados serão preservados. Obrigações já assumidas continuam nos indicadores até a conciliação explícita. Deseja continuar?"
          }
          confirmLabel={
            confirm.kind === "PAYMENT_ARCHIVE"
              ? "Cancelar registro"
              : "Arquivar"
          }
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            await change(
              confirm.kind,
              confirm.record.id,
              confirm.record.version,
              {},
              confirm.request,
            );
            setConfirm(null);
            if (confirm.kind === "SUPPLIER_ARCHIVE") setSupplierDetail(null);
          }}
        />
      ) : null}
    </>
  );
}
function UploadModal({
  data,
  target,
  onUpload,
  onClose,
}: {
  data: PlanningData;
  target: { supplier_id?: string; entry_id?: string; payment_id?: string };
  onUpload: (
    file: File,
    target: { supplier_id?: string; entry_id?: string; payment_id?: string },
    identifier: string,
    request: string,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [selected, setSelected] = useState(
      Object.entries(target).map(([k, v]) => `${k}:${v}`)[0] || "",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ids, setIds] = useState(() => ({ id: id(), request: id() })),
    lock = useRef(false);
  return (
    <AdminModal
      title="Anexar documento privado"
      onClose={onClose}
      dismissible={!busy}
    >
      <Text style={styles.text}>
        PDF, JPG ou PNG até 10 MB. Somente administradores do evento poderão
        acessar.
      </Text>
      <Select
        label="Vincular documento"
        value={selected}
        onChange={setSelected}
        disabled={!!Object.keys(target).length || busy}
        options={[
          { value: "", label: "Selecione o vínculo" },
          ...data.suppliers
            .filter((s) => !s.deleted_at || selected === `supplier_id:${s.id}`)
            .map((s) => ({
              value: `supplier_id:${s.id}`,
              label: `Fornecedor: ${s.name}`,
            })),
          ...data.entries
            .filter((e) => !e.deleted_at || selected === `entry_id:${e.id}`)
            .map((e) => ({
              value: `entry_id:${e.id}`,
              label: `Lançamento: ${e.title}`,
            })),
          ...data.payments
            .filter((p) => !p.deleted_at || selected === `payment_id:${p.id}`)
            .map((p) => ({
              value: `payment_id:${p.id}`,
              label: `Pagamento: ${money(p.amount_cents)} · ${day(p.paid_on)}`,
            })),
        ]}
      />
      {Platform.OS === "web" ? (
        React.createElement("input", {
          type: "file",
          accept: "application/pdf,image/jpeg,image/png",
          "aria-label": "Selecionar documento",
          disabled: busy,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            setFile(e.target.files?.[0] || null);
            setIds({ id: id(), request: id() });
          },
          style: { maxWidth: "100%", color: theme.colors.ink, padding: 12 },
        })
      ) : (
        <Text style={styles.text}>
          Abra este módulo pelo navegador para anexar arquivos.
        </Text>
      )}
      {error ? (
        <Text role="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button
        title="Salvar documento"
        disabled={!file || !selected || busy}
        onPress={async () => {
          if (lock.current || !file) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            if (
              !file.size ||
              file.size > 10485760 ||
              !/\.(pdf|jpe?g|png)$/i.test(file.name)
            )
              throw Error("Use PDF, JPG ou PNG até 10 MB.");
            const [key, value] = selected.split(":");
            await onUpload(file, { [key!]: value }, ids.id, ids.request);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Falha ao anexar.");
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      />
    </AdminModal>
  );
}
