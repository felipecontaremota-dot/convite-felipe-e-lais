import { useRef, useState } from "react";
import { Text } from "react-native";
import { AdminModal } from "../../components/AdminModal";
import { Button, Choice, Field, Toggle, styles } from "../../components/ui";
import { Select } from "../../components/adminUi";
import { id } from "../../repositories/demo";
import { formatPhone } from "../guests/adminDomain";
import {
  cents,
  contractStates,
  day,
  maskTax,
  maskDate,
  moneyInput,
  pixKey,
  todaySP,
  validTax,
  type PlanningData,
} from "./domain";
export type EditorKind =
  | "SUPPLIER"
  | "ENTRY"
  | "INSTALLMENT"
  | "PAYMENT"
  | "BUDGET"
  | "SCHEDULE"
  | "DOCUMENT";
type RecordValue = { id: string; version: number } & Record<string, unknown>;
export const recordValue = (v: object | null | undefined) =>
  v as RecordValue | undefined;
type Config = [
  string,
  string,
  ("money" | "date" | "tax" | "phone" | "multiline")?,
];
const supplierFields: Config[] = [
  ["name", "Nome do fornecedor ou empresa"],
  ["responsible", "Nome do responsável"],
  ["tax_id", "CPF ou CNPJ", "tax"],
  ["category", "Categoria principal"],
  ["phone", "Telefone", "phone"],
  ["whatsapp", "WhatsApp", "phone"],
  ["email", "E-mail"],
  ["website", "Site ou Instagram"],
  ["address", "Endereço"],
  ["pix_key", "Chave PIX"],
  ["holder_name", "Nome do titular"],
  ["holder_tax_id", "CPF/CNPJ do titular", "tax"],
  ["bank", "Banco"],
  ["agency", "Agência"],
  ["account", "Conta"],
  ["notes", "Observações", "multiline"],
];
const general: Config[] = [
  ["title", "Título"],
  ["category", "Categoria"],
  ["description", "Descrição", "multiline"],
  ["contracted_on", "Data da contratação", "date"],
  ["delivery_on", "Data de execução ou entrega", "date"],
  ["notes", "Observações", "multiline"],
];
const financial: Config[] = [
  ["estimated_cents", "Valor inicialmente orçado", "money"],
  ["agreed_cents", "Valor contratado ou comprometido", "money"],
  ["discount_cents", "Desconto negociado", "money"],
  ["settlement_cents", "Obrigação mantida após cancelamento", "money"],
  ["payment_method", "Forma de pagamento prevista"],
  ["financial_notes", "Observações financeiras", "multiline"],
];
const installmentFields: Config[] = [
  ["description", "Descrição da parcela"],
  ["position", "Número ou ordem"],
  ["amount_cents", "Valor previsto da parcela", "money"],
  ["due_on", "Data de vencimento", "date"],
  ["notes", "Observações", "multiline"],
];
const paymentFields: Config[] = [
  ["amount_cents", "Valor efetivamente pago", "money"],
  ["paid_on", "Data efetiva do pagamento", "date"],
  ["method", "Forma de pagamento"],
  ["notes", "Observações", "multiline"],
];
export const planningDate = (value: string) => {
  if (!value) return null;
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value))
    throw Error("Use datas no formato DD/MM/AAAA.");
  const iso = value.split("/").reverse().join("-");
  const parsed = new Date(iso + "T12:00:00Z");
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== iso
  )
    throw Error("Informe uma data válida.");
  return iso;
};
export function PlanningEditor({
  kind,
  record,
  data,
  entryId,
  onSave,
  onClose,
}: {
  kind: EditorKind;
  record?: RecordValue;
  data: PlanningData;
  entryId?: string;
  onSave: (
    kind: string,
    id: string,
    version: number | null,
    values: Record<string, unknown>,
    request: string,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [identifier] = useState(() => record?.id || id());
  const [tab, setTab] = useState("general"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [overpay, setOverpay] = useState(false);
  const lock = useRef(false),
    request = useRef({ body: "", id: id() });
  const fields =
    kind === "SUPPLIER"
      ? supplierFields
      : kind === "ENTRY"
        ? [...general, ...financial]
        : kind === "INSTALLMENT"
          ? installmentFields
          : kind === "PAYMENT"
            ? paymentFields
            : kind === "DOCUMENT"
              ? [["name", "Identificação do documento"] as Config]
              : kind === "BUDGET"
                ? [["amount_cents", "Orçamento global", "money"] as Config]
                : ([
                    ["quantity", "Quantidade de parcelas"],
                    ["first_due_on", "Primeiro vencimento", "date"],
                  ] as Config[]);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [key, , type] of fields)
      out[key] =
        type === "money"
          ? moneyInput(Number(record?.[key] || 0))
          : type === "date"
            ? record?.[key]
              ? day(String(record[key]))
              : ""
            : String(record?.[key] || "");
    return {
      ...out,
      kind: String(record?.kind || "SERVICE"),
      status: String(record?.status || "PLANNED"),
      supplier_id: String(record?.supplier_id || ""),
      entry_id: String(record?.entry_id || entryId || ""),
      installment_id: String(record?.installment_id || ""),
      position: String(record?.position || 1),
      pix_type: String(record?.pix_type || ""),
      paid_on: record?.paid_on ? day(String(record.paid_on)) : day(todaySP()),
      quantity: "1",
    };
  });
  const set = (key: string, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));
  const choose = (
    key: string,
    label: string,
    options: { value: string; label: string }[],
    disabled = false,
  ) => (
    <Select
      key={key}
      label={label}
      value={values[key] || ""}
      onChange={(v) => {
        set(key, v);
        if (key === "entry_id") set("installment_id", "");
      }}
      options={options}
      disabled={disabled || busy}
    />
  );
  const submit = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, , type] of fields) {
        const value = (values[key] || "").trim();
        payload[key] =
          type === "money"
            ? cents(value)
            : type === "date"
              ? planningDate(value)
              : type === "tax"
                ? value.replace(/\D/g, "")
                : value;
        if (type === "tax" && payload[key] && !validTax(String(payload[key])))
          throw Error("Confira o CPF/CNPJ informado.");
      }
      if (kind === "DOCUMENT" && !payload.name)
        throw Error("Informe uma identificação para o documento.");
      if (kind === "SUPPLIER") {
        if (!payload.name) throw Error("Informe o nome do fornecedor.");
        payload.pix_type = values.pix_type;
        payload.pix_key = pixKey(values.pix_type || "", values.pix_key || "");
      }
      if (kind === "ENTRY") {
        if (!payload.title) throw Error("Informe o título.");
        Object.assign(payload, {
          kind: values.kind,
          status: values.status,
          supplier_id: values.supplier_id || null,
        });
        if (Number(payload.discount_cents) > Number(payload.agreed_cents))
          throw Error("O desconto não pode superar o valor contratado.");
      }
      if (kind === "INSTALLMENT" || kind === "PAYMENT") {
        payload.entry_id = values.entry_id;
        if (!payload.entry_id)
          throw Error("Selecione uma despesa ou contrato.");
        if (Number(payload.amount_cents) <= 0)
          throw Error("Informe um valor maior que zero.");
      }
      if (kind === "INSTALLMENT") {
        payload.position = Number(values.position);
        if (
          !Number.isInteger(payload.position) ||
          Number(payload.position) < 1 ||
          !payload.due_on ||
          !payload.description
        )
          throw Error("Informe descrição, ordem e vencimento válidos.");
      }
      if (kind === "PAYMENT") {
        payload.installment_id = values.installment_id;
        if (!payload.installment_id || !payload.paid_on || !payload.method)
          throw Error("Selecione a parcela, a data e a forma de pagamento.");
        if (String(payload.paid_on) > todaySP())
          throw Error("Um pagamento realizado não pode ter data futura.");
      }
      if (kind === "SCHEDULE") {
        payload.quantity = Number(values.quantity);
        if (
          !Number.isInteger(payload.quantity) ||
          Number(payload.quantity) < 1 ||
          Number(payload.quantity) > 120 ||
          !payload.first_due_on
        )
          throw Error("Informe de 1 a 120 parcelas e o primeiro vencimento.");
      }
      if (["ENTRY", "PAYMENT", "INSTALLMENT"].includes(kind))
        payload.allow_overpay = overpay;
      const body = JSON.stringify(payload);
      if (request.current.body !== body) request.current = { body, id: id() };
      await onSave(
        kind === "SCHEDULE" ? "SCHEDULE_GENERATE" : `${kind}_SAVE`,
        kind === "BUDGET"
          ? entryId!
          : kind === "SCHEDULE"
            ? entryId!
            : identifier,
        record?.version ?? null,
        payload,
        request.current.id,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const title = {
    SUPPLIER: "Fornecedor",
    ENTRY: "Despesa ou contratação",
    INSTALLMENT: "Parcela",
    PAYMENT: "Registro de pagamento",
    BUDGET: "Orçamento global",
    SCHEDULE: "Gerar parcelas",
    DOCUMENT: "Identificação do documento",
  }[kind];
  const visible =
    kind === "ENTRY" ? (tab === "general" ? general : financial) : fields;
  return (
    <AdminModal
      title={title}
      onClose={onClose}
      dismissible={!busy}
      contentWidth={720}
    >
      {kind === "ENTRY" ? (
        <Choice
          value={tab}
          onChange={setTab}
          options={[
            { value: "general", label: "Dados gerais" },
            { value: "financial", label: "Informações financeiras" },
          ]}
        />
      ) : null}
      {kind === "ENTRY" && tab === "general" ? (
        <>
          {choose("kind", "Tipo", [
            { value: "SERVICE", label: "Contratação de serviço" },
            { value: "EXPENSE", label: "Despesa avulsa" },
          ])}
          {choose("supplier_id", "Fornecedor (opcional)", [
            { value: "", label: "Sem fornecedor" },
            ...data.suppliers
              .filter((s) => !s.deleted_at || s.id === values.supplier_id)
              .map((s) => ({
                value: s.id,
                label: s.name + (s.deleted_at ? " (arquivado)" : ""),
              })),
          ])}
          {choose(
            "status",
            "Situação da contratação",
            Object.entries(contractStates).map(([value, label]) => ({
              value,
              label,
            })),
          )}
        </>
      ) : null}
      {kind === "SUPPLIER"
        ? choose("pix_type", "Tipo de chave PIX", [
            { value: "", label: "Sem chave PIX" },
            { value: "CPF", label: "CPF" },
            { value: "CNPJ", label: "CNPJ" },
            { value: "PHONE", label: "Telefone (+DDI)" },
            { value: "EMAIL", label: "E-mail" },
            { value: "RANDOM", label: "Chave aleatória" },
          ])
        : null}
      {kind === "INSTALLMENT" || kind === "PAYMENT" ? (
        <>
          {choose(
            "entry_id",
            "Despesa ou contrato",
            [
              { value: "", label: "Selecione" },
              ...data.entries
                .filter((e) => !e.deleted_at || e.id === values.entry_id)
                .map((e) => ({ value: e.id, label: e.title })),
            ],
            !!record || !!entryId,
          )}
          {kind === "PAYMENT"
            ? choose(
                "installment_id",
                "Parcela",
                [
                  { value: "", label: "Selecione a parcela" },
                  ...data.installments
                    .filter(
                      (i) =>
                        i.entry_id === values.entry_id &&
                        (!i.deleted_at || i.id === values.installment_id),
                    )
                    .map((i) => ({
                      value: i.id,
                      label: i.description + " · " + day(i.due_on),
                    })),
                ],
                !!record,
              )
            : null}
        </>
      ) : null}
      {visible.map(([key, label, type]) => (
        <Field
          key={key}
          label={type === "date" ? `${label} (DD/MM/AAAA)` : label}
          value={values[key] || ""}
          onChangeText={(v) => set(key, type === "date" ? maskDate(v) : v)}
          editable={!busy}
          multiline={type === "multiline"}
          keyboardType={
            type === "money"
              ? "decimal-pad"
              : type === "phone"
                ? "phone-pad"
                : "default"
          }
          onBlur={() => {
            try {
              if (type === "money")
                set(key, moneyInput(cents(values[key] || "0")));
              if (type === "phone" && values[key])
                set(key, formatPhone(values[key] || ""));
              if (key === "pix_key" && values.pix_type === "PHONE") {
                const raw = (values[key] || "").replace(/[()\s-]/g, "");
                if (/^\+55[0-9]{10,11}$/.test(raw))
                  set(key, "+55 " + formatPhone(raw.slice(3)));
              }
              if (
                type === "tax" ||
                (key === "pix_key" &&
                  ["CPF", "CNPJ"].includes(values.pix_type || ""))
              )
                set(key, maskTax(values[key] || ""));
            } catch {
              /* Validation remains visible on submit. */
            }
          }}
        />
      ))}
      {kind === "SUPPLIER" && values.pix_type === "PHONE" ? (
        <Text style={styles.small}>
          Informe a chave PIX como cadastrada no banco, com + e DDI. Exemplo:
          +5562999999999.
        </Text>
      ) : null}
      {kind === "ENTRY" && tab === "financial" ? (
        <Text style={styles.small}>
          Valor final:{" "}
          {moneyInput(
            Math.max(
              0,
              (() => {
                try {
                  return (
                    cents(values.agreed_cents || "0") -
                    cents(values.discount_cents || "0")
                  );
                } catch {
                  return 0;
                }
              })(),
            ),
          )}
          . Ao cancelar, informe explicitamente a obrigação mantida. Pagamentos
          anteriores não são apagados.
        </Text>
      ) : null}
      {["ENTRY", "PAYMENT", "INSTALLMENT"].includes(kind) ? (
        <Toggle
          label="Confirmo valor superior ao saldo ou crédito a conciliar"
          value={overpay}
          onChange={setOverpay}
        />
      ) : null}
      {kind === "SCHEDULE" ? (
        <Text style={styles.small}>
          Divide o saldo ainda não pago em parcelas mensais, sem perder
          centavos. Disponível somente quando ainda não há cronograma ativo.
        </Text>
      ) : null}
      {error ? (
        <Text role="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button title="Salvar" onPress={submit} disabled={busy} />
      <Button title="Cancelar" secondary onPress={onClose} disabled={busy} />
    </AdminModal>
  );
}
