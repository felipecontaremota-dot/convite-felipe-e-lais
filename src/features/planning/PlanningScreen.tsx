import { createElement, useEffect, useRef, useState } from "react";
import { Platform, Text, View, useWindowDimensions } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useApp } from "../../lib/AppProvider";
import {
  Screen,
  Button,
  Card,
  Choice,
  Empty,
  Field,
  styles,
} from "../../components/ui";
import { AdminModal, ConfirmModal } from "../../components/AdminModal";
import { theme } from "../../theme/tokens";
import { feedbackColors } from "../../theme/feedback";
import * as api from "../../repositories/api";
import { cents, day, money, moneyInput, maskDate, todaySP } from "./domain";
import {
  PlanningCard,
  PlanningCardStyles,
  ProgressBadge,
} from "./PlanningCard";
import { SupplierEditor, isoDate } from "./SupplierEditor";
import { demoSimple, demoSimpleAction } from "./demo";
import {
  simpleLedger,
  paymentRows,
  progressColor,
  simpleError,
  type SimpleData,
  type Vendor,
  type Settlement,
  type Due,
  type PaySort,
} from "./simpleDomain";
type Action = (
  kind: string,
  id: string,
  version: number | null,
  values: Record<string, unknown>,
  request: string,
) => Promise<void>;
const tabs = [
  { value: "overview", label: "Visão geral" },
  { value: "suppliers", label: "Fornecedores" },
  { value: "payments", label: "Pagamentos" },
];
export function PlanningScreen() {
  const app = useApp();
  return (
    <Screen title="Planejamento do Casamento" section="admin">
      {app.data?.role === "ADMIN" ? <PlanningContent key={app.scope} /> : null}
    </Screen>
  );
}
export function FinancialProgress({ percent }: { percent: number }) {
  return (
    <>
      {Platform.OS === "web"
        ? createElement(
            "style",
            null,
            "[data-financial-progress]{transition:width .6s ease,background-color .6s linear;}@media(prefers-reduced-motion:reduce){[data-financial-progress]{transition:none!important;}}",
          )
        : null}
      {Platform.OS === "web" ? (
        createElement(
          "div",
          {
            role: "progressbar",
            "aria-label": "Percentual pago",
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": percent,
            style: {
              height: 12,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: theme.colors.wash,
            },
          },
          createElement("div", {
            "data-financial-progress": "true",
            style: {
              height: 12,
              width: `${percent}%`,
              backgroundColor: progressColor(percent),
            },
          }),
        )
      ) : (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Percentual pago"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          style={{
            height: 12,
            borderRadius: 12,
            overflow: "hidden",
            backgroundColor: theme.colors.wash,
          }}
        >
          <View
            style={{
              height: 12,
              width: `${percent}%`,
              backgroundColor: progressColor(percent),
            }}
          />
        </View>
      )}
      <Text style={styles.text}>
        {percent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% pago
      </Text>
    </>
  );
}
function Status({ label }: { label: string }) {
  const tone =
    label === "Pago"
      ? feedbackColors.confirmed
      : label === "Vencido"
        ? feedbackColors.declined
        : label === "Pendente"
          ? feedbackColors.neutral
          : feedbackColors.deciding;
  return (
    <Text
      style={{
        alignSelf: "flex-start",
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 12,
        backgroundColor: tone.background,
        color: tone.text,
        fontWeight: "600",
      }}
    >
      {label}
    </Text>
  );
}
function PlanningContent() {
  const app = useApp(),
    client = useQueryClient(),
    event = app.data!.event.id,
    key = ["simple-planning", app.scope];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      app.isDemo ? demoSimple(event) : api.simplePlanningSnapshot(),
    enabled: app.online,
    retry: false,
    refetchInterval: app.online ? 30000 : false,
  });
  useEffect(
    () => () => {
      client.removeQueries({ queryKey: ["simple-planning", app.scope] });
    },
    [client, app.scope],
  );
  const [today, setToday] = useState(todaySP);
  useEffect(() => {
    const t = setInterval(() => setToday(todaySP()), 60000);
    return () => clearInterval(t);
  }, []);
  const [tab, setTab] = useState("overview"),
    [editor, setEditor] = useState<Vendor | null | undefined>(undefined),
    [detail, setDetail] = useState<string | null>(null),
    [budget, setBudget] = useState(false),
    [payment, setPayment] = useState<{ due: Due; old?: Settlement } | null>(
      null,
    ),
    [confirmation, setConfirmation] = useState<{
      kind: string;
      id: string;
      version: number;
      paid: number;
      name: string;
    } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState("");
  const lock = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const act: Action = async (kind, id, version, values, request) => {
    if (lock.current) throw Error("Aguarde a operação atual.");
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (app.isDemo) demoSimpleAction(event, kind, id, version, values);
      else if (kind === "BUDGET_SAVE")
        await api.planningAction(kind, id, version, values, request);
      else await api.simplePlanningAction(kind, id, version, values, request);
      await query.refetch();
      if (active.current) setNotice("Planejamento atualizado.");
    } catch (e) {
      if (active.current) setError(simpleError(e));
      throw e;
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  if (query.isPending)
    return <Text style={styles.text}>Carregando planejamento…</Text>;
  if (query.isError || !query.data)
    return (
      <>
        <Text style={styles.error}>
          Não foi possível carregar o planejamento.
        </Text>
        <Button title="Tentar novamente" onPress={() => query.refetch()} />
      </>
    );
  const data = query.data;
  let l: ReturnType<typeof simpleLedger>;
  try {
    l = simpleLedger(data, today);
  } catch (e) {
    return (
      <>
        <Text style={styles.error}>{simpleError(e)}</Text>
        <Button
          title="Atualizar planejamento"
          onPress={() => query.refetch()}
        />
      </>
    );
  }
  const vendor = l.vendors.find((v) => v.id === detail);
  const dueRow = (d: (typeof l.dues)[number]) => (
    <Card key={d.id}>
      <Text style={styles.heading}>
        {l.vendors.find((v) => v.id === d.vendor_id)!.name}
      </Text>
      <Text style={styles.text}>
        {d.label} · {day(d.due_on)} · {money(d.remaining)}
      </Text>
      <Status label={d.status} />
      <Button
        title={`Registrar pagamento de ${d.label}`}
        secondary
        disabled={busy || !app.online || !d.remaining}
        onPress={() => setPayment({ due: d })}
      />
    </Card>
  );
  const disabled = busy || !app.online;
  return (
    <>
      <PlanningCardStyles />
      <Text style={styles.text}>
        Fornecedores, vencimentos e pagamentos do nosso grande dia.
      </Text>
      <Button
        title="Atualizar planejamento"
        secondary
        onPress={() => query.refetch()}
        disabled={disabled}
      />
      <Choice value={tab} onChange={setTab} options={tabs} />
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {tab === "overview" ? (
        <>
          {data.legacy_count > 0 ? (
            <Text style={styles.small}>
              Controle simplificado: os registros financeiros anteriores foram
              preservados em arquivo. Os cadastros de fornecedores e o orçamento
              foram mantidos; confira e defina o valor e o plano de cada
              contrato neste novo controle.
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {[
              [
                "Orçamento previsto",
                data.budget ? money(data.budget.amount_cents) : "Não definido",
              ],
              ["Total contratado", money(l.total)],
              ["Total pago", money(l.paid)],
              ["Saldo a pagar", money(l.balance)],
              [
                "Pagamentos vencidos",
                `${l.overdue.length} · ${money(l.overdue.reduce((n, d) => n + d.remaining, 0))}`,
              ],
              [
                "Próximos pagamentos",
                `${l.upcoming.length} · ${money(l.upcoming.reduce((n, d) => n + d.remaining, 0))}`,
              ],
            ].map(([label, value]) => (
              <View key={label} style={{ flexGrow: 1, flexBasis: 260 }}>
                <Card>
                  <Text style={styles.small}>{label}</Text>
                  <Text style={styles.heading}>{value}</Text>
                  {label === "Orçamento previsto" ? (
                    <Button
                      title={
                        data.budget ? "Editar orçamento" : "Definir orçamento"
                      }
                      secondary
                      onPress={() => setBudget(true)}
                      disabled={disabled}
                    />
                  ) : null}
                </Card>
              </View>
            ))}
          </View>
          <FinancialProgress percent={l.percent} />
          <Text style={styles.heading}>Pagamentos vencidos</Text>
          {l.overdue.length ? (
            l.overdue.map(dueRow)
          ) : (
            <Empty text="Nenhum pagamento vencido." />
          )}
          <Text style={styles.heading}>Próximos pagamentos</Text>
          {l.upcoming.length ? (
            l.upcoming.slice(0, 8).map(dueRow)
          ) : (
            <Empty text="Nenhum vencimento futuro pendente." />
          )}
        </>
      ) : null}
      {tab === "suppliers" ? (
        <>
          <Button
            title="Cadastrar fornecedor"
            onPress={() => setEditor(null)}
            disabled={disabled}
          />
          <Field
            label="Buscar fornecedor"
            value={search}
            onChangeText={setSearch}
          />
          {l.vendors
            .filter((v) =>
              v.name
                .toLocaleLowerCase("pt-BR")
                .includes(search.toLocaleLowerCase("pt-BR")),
            )
            .map((v) => (
              <PlanningCard
                key={v.id}
                kind="supplier"
                label={`Abrir fornecedor ${v.name}`}
                onPress={() => setDetail(v.id)}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <Text style={[styles.heading, { flex: 1, minWidth: 0 }]}>
                    {v.name}
                  </Text>
                  <ProgressBadge percent={v.percent} vendor={v.name} />
                </View>
                <Text style={styles.text}>
                  Valor contratado: {money(v.total_cents)}
                </Text>
                <Text style={styles.text}>
                  Pago: {money(v.paid)} · Saldo: {money(v.balance)}
                </Text>
              </PlanningCard>
            ))}
          {!l.vendors.length ? (
            <Empty text="Cadastre o primeiro fornecedor e defina seu plano financeiro." />
          ) : null}
        </>
      ) : null}
      {tab === "payments" ? (
        <Payments
          data={data}
          onEdit={(p) =>
            setPayment({
              old: p,
              due: data.dues.find((d) => d.id === p.due_id)!,
            })
          }
          onDelete={(p) =>
            setConfirmation({
              kind: "PAYMENT_DELETE",
              id: p.id,
              version: p.version,
              paid: p.amount_cents,
              name: l.vendors.find((v) => v.id === p.vendor_id)!.name,
            })
          }
          disabled={disabled}
        />
      ) : null}
      {vendor ? (
        <AdminModal
          title={vendor.name}
          onClose={() => setDetail(null)}
          contentWidth={760}
        >
          <Text style={styles.text}>
            Valor contratado: {money(vendor.total_cents)}
          </Text>
          <Text style={styles.text}>Pago: {money(vendor.paid)}</Text>
          <Text style={styles.text}>
            Saldo pendente: {money(vendor.balance)}
          </Text>
          {Object.entries(vendor.details)
            .filter(([, value]) => value)
            .map(([field, value]) => (
              <Text key={field} style={styles.text}>
                {detailLabel(field)}: {value}
              </Text>
            ))}
          {vendor.details.pix_key ? (
            <Button
              title="Copiar chave PIX"
              secondary
              onPress={async () => {
                await Clipboard.setStringAsync(vendor.details.pix_key!);
                setNotice("Chave PIX copiada.");
              }}
            />
          ) : null}
          <Button
            title="Editar fornecedor e plano"
            onPress={() => setEditor(vendor)}
            disabled={disabled}
          />
          <Text style={styles.heading}>Plano financeiro</Text>
          {vendor.dues.length ? (
            vendor.dues.map((d) => (
              <Card key={d.id}>
                <Text style={styles.heading}>{d.label}</Text>
                <Text style={styles.text}>
                  {day(d.due_on)} · Previsto: {money(d.amount_cents)}
                </Text>
                <Text style={styles.text}>
                  Pago: {money(d.paid)} · Saldo: {money(d.remaining)}
                </Text>
                <Status label={d.status} />
                <Button
                  title={`Registrar pagamento de ${d.label}`}
                  secondary
                  disabled={disabled || d.remaining === 0}
                  onPress={() => setPayment({ due: d })}
                />
              </Card>
            ))
          ) : (
            <Text style={styles.small}>
              Informe o valor contratado e defina o plano financeiro.
            </Text>
          )}
          <Button
            title="Excluir fornecedor"
            secondary
            onPress={() =>
              setConfirmation({
                kind: "VENDOR_DELETE",
                id: vendor.id,
                version: vendor.version,
                paid: vendor.paid,
                name: vendor.name,
              })
            }
            disabled={disabled}
          />
        </AdminModal>
      ) : null}
      {editor !== undefined ? (
        <SupplierEditor
          vendor={editor || undefined}
          dues={data.dues.filter((d) => d.vendor_id === editor?.id)}
          paid={Object.fromEntries(
            l.dues
              .filter((d) => d.vendor_id === editor?.id)
              .map((d) => [d.id, d.paid]),
          )}
          onClose={() => setEditor(undefined)}
          onSave={(id, version, values, request) =>
            act("VENDOR_SAVE", id, version, values, request)
          }
        />
      ) : null}
      {payment ? (
        <PaymentEditor
          due={payment.due}
          old={payment.old}
          data={data}
          onClose={() => setPayment(null)}
          onSave={act}
        />
      ) : null}
      {budget ? (
        <BudgetEditor
          data={data}
          event={event}
          onClose={() => setBudget(false)}
          onSave={act}
        />
      ) : null}
      {confirmation ? (
        <ConfirmModal
          title={
            confirmation.kind === "VENDOR_DELETE"
              ? "Excluir fornecedor"
              : "Cancelar registro de pagamento"
          }
          text={
            confirmation.kind === "VENDOR_DELETE"
              ? `${confirmation.name} possui ${money(confirmation.paid)} em pagamentos registrados. A exclusão retirará também o histórico financeiro deste fornecedor do Planejamento do Casamento. Os registros de auditoria serão preservados. Deseja continuar?`
              : "Cancelar somente este registro financeiro? Isso não realiza estorno bancário e preserva a auditoria."
          }
          confirmLabel={
            confirmation.kind === "VENDOR_DELETE"
              ? "Excluir fornecedor"
              : "Cancelar registro"
          }
          onCancel={() => setConfirmation(null)}
          onConfirm={async () => {
            await act(
              confirmation.kind,
              confirmation.id,
              confirmation.version,
              { expected_paid_cents: confirmation.paid },
              crypto.randomUUID(),
            );
            if (confirmation.kind === "VENDOR_DELETE") setDetail(null);
            setConfirmation(null);
          }}
        />
      ) : null}
    </>
  );
}
const labels: Record<string, string> = {
  tax_id: "CPF/CNPJ",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  notes: "Observações",
  bank: "Banco",
  agency: "Agência",
  account: "Conta",
  account_type: "Tipo de conta",
  holder_name: "Titular",
  holder_tax_id: "CPF/CNPJ do titular",
  pix_key: "Chave PIX",
  pix_type: "Tipo de chave PIX",
  responsible: "Responsável",
  category: "Categoria",
  website: "Site/Instagram",
  address: "Endereço",
};
const detailLabel = (field: string) => labels[field] || field;
function Payments({
  data,
  onEdit,
  onDelete,
  disabled,
}: {
  data: SimpleData;
  onEdit: (p: Settlement) => void;
  onDelete: (p: Settlement) => void;
  disabled: boolean;
}) {
  const [sort, setSort] = useState<PaySort>("vendor"),
    [descending, setDescending] = useState(false),
    width = useWindowDimensions().width;
  const rows = paymentRows(data, sort, descending),
    ledger = simpleLedger(data),
    total = ledger.paid;
  const headers: [PaySort, string][] = [
    ["vendor", "Fornecedor"],
    ["due", "Data de vencimento"],
    ["paid", "Data de pagamento"],
    ["amount", "Valor pago"],
  ];
  return (
    <>
      <Text style={styles.heading}>
        Total pago:{" "}
        <Text style={{ color: feedbackColors.confirmed.text }}>
          {money(total)}
        </Text>
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {headers.map(([key, label]) => (
          <Button
            key={key}
            title={`${label}${sort === key ? (descending ? " ↓" : " ↑") : ""}`}
            secondary
            onPress={() => {
              setDescending(sort === key ? !descending : false);
              setSort(key);
            }}
          />
        ))}
      </View>
      {rows.length ? (
        rows.map((p) => (
          <PlanningCard
            key={p.id}
            kind="payment"
            label={`Editar pagamento de ${p.vendor}`}
            onPress={() => onEdit(p)}
            disabled={disabled}
            secondary={
              <Button
                title={`Cancelar pagamento de ${p.vendor}`}
                secondary
                disabled={disabled}
                onPress={() => onDelete(p)}
              />
            }
          >
            <View style={{ alignItems: "flex-end" }}>
              <ProgressBadge
                percent={
                  ledger.vendors.find((v) => v.id === p.vendor_id)!.percent
                }
                vendor={p.vendor}
              />
            </View>
            <View
              {...(Platform.OS === "web"
                ? { dataSet: { paymentRow: p.id } }
                : {})}
              style={{ flexDirection: width > 700 ? "row" : "column", gap: 12 }}
            >
              {[
                p.vendor,
                day(p.due),
                day(p.paid_on),
                money(p.amount_cents),
              ].map((value, i) => (
                <View
                  key={i}
                  style={width > 700 ? { flex: 1, minWidth: 0 } : {}}
                >
                  <Text style={styles.small}>{headers[i]![1]}</Text>
                  <Text style={styles.text}>{value}</Text>
                </View>
              ))}
            </View>
          </PlanningCard>
        ))
      ) : (
        <Empty text="Nenhum pagamento realizado." />
      )}
    </>
  );
}
function PaymentEditor({
  due,
  old,
  data,
  onClose,
  onSave,
}: {
  due: Due;
  old?: Settlement;
  data: SimpleData;
  onClose: () => void;
  onSave: Action;
}) {
  const remaining =
    simpleLedger(data).dues.find((d) => d.id === due.id)!.remaining +
    (old?.amount_cents || 0);
  const [identifier] = useState(() => old?.id || crypto.randomUUID()),
    [amount, setAmount] = useState(moneyInput(old?.amount_cents ?? remaining)),
    [date, setDate] = useState(day(old?.paid_on || todaySP())),
    [method, setMethod] = useState(old?.method || "PIX"),
    [notes, setNotes] = useState(old?.notes || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    request = useRef({ body: "", id: crypto.randomUUID() });
  return (
    <AdminModal
      title="Registrar pagamento"
      onClose={onClose}
      dismissible={!busy}
    >
      <Text style={styles.text}>
        {data.vendors.find((v) => v.id === due.vendor_id)!.name} · {due.label}
      </Text>
      <Text style={styles.text}>Saldo devido: {money(remaining)}</Text>
      <Field
        label="Valor pago"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        editable={!busy}
      />
      <Field
        label="Data efetiva do pagamento (DD/MM/AAAA)"
        value={date}
        onChangeText={(v) => setDate(maskDate(v))}
        editable={!busy}
      />
      <Field
        label="Forma de pagamento"
        value={method}
        onChangeText={setMethod}
        editable={!busy}
      />
      <Field
        label="Observação (opcional)"
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={4000}
        editable={!busy}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button
        title="Salvar pagamento"
        disabled={busy}
        onPress={async () => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          try {
            const n = cents(amount),
              paidOn = isoDate(date);
            if (n <= 0) throw Error("Informe um valor maior que zero.");

            if (paidOn > todaySP()) throw Error("simple_future_payment");
            if (!method.trim()) throw Error("Informe a forma de pagamento.");
            const values = {
              due_id: due.id,
              amount_cents: n,
              paid_on: paidOn,
              method: method.trim(),
              notes,
            };
            const body = JSON.stringify(values);
            if (n > remaining && body !== request.current.body)
              throw Error("simple_overpay");
            if (body !== request.current.body)
              request.current = { body, id: crypto.randomUUID() };
            await onSave(
              "PAYMENT_SAVE",
              identifier,
              old?.version ?? null,
              values,
              request.current.id,
            );
            onClose();
          } catch (e) {
            setError(simpleError(e));
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      />
    </AdminModal>
  );
}
function BudgetEditor({
  data,
  event,
  onClose,
  onSave,
}: {
  data: SimpleData;
  event: string;
  onClose: () => void;
  onSave: Action;
}) {
  const [value, setValue] = useState(
      moneyInput(data.budget?.amount_cents || 0),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    request = useRef({ body: "", id: crypto.randomUUID() });
  return (
    <AdminModal
      title="Orçamento previsto"
      onClose={onClose}
      dismissible={!busy}
    >
      <Field
        label="Orçamento previsto"
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
        editable={!busy}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        title="Salvar orçamento"
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          try {
            const values = { amount_cents: cents(value) },
              body = JSON.stringify(values);
            if (body !== request.current.body)
              request.current = { body, id: crypto.randomUUID() };
            await onSave(
              "BUDGET_SAVE",
              event,
              data.budget?.version ?? null,
              values,
              request.current.id,
            );
            onClose();
          } catch (e) {
            setError(simpleError(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </AdminModal>
  );
}
