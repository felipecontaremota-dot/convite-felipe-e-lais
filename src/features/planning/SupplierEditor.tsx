import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { AdminModal } from "../../components/AdminModal";
import { Button, Choice, Field, Toggle, styles } from "../../components/ui";
import { Select } from "../../components/adminUi";
import {
  cents,
  day,
  maskDate,
  maskTax,
  money,
  moneyInput,
  pixKey,
  todaySP,
  validTax,
} from "./domain";
import { supplierPixCandidate, updateSupplierPix } from "./supplierPix";
import {
  monthlyDate,
  splitCents,
  simpleError,
  sum,
  type Vendor,
  type Due,
} from "./simpleDomain";
export type DraftDue = {
  id: string;
  label: string;
  amount: string;
  date: string;
};
export function isoDate(value: string) {
  const [d, m, y] = value.split("/");
  const iso = `${y}-${m}-${d}`;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    Number.isNaN(Date.parse(iso)) ||
    new Date(iso + "T12:00:00Z").toISOString().slice(0, 10) !== iso
  )
    throw Error("Informe um vencimento válido em DD/MM/AAAA.");
  return iso;
}
const extraFields = [
  ["tax_id", "CPF ou CNPJ"],
  ["responsible", "Responsável"],
  ["phone", "Telefone"],
  ["whatsapp", "WhatsApp"],
  ["email", "E-mail"],
  ["bank", "Banco"],
  ["agency", "Agência"],
  ["account", "Conta"],
  ["account_type", "Tipo de conta"],
  ["holder_name", "Titular"],
  ["holder_tax_id", "CPF/CNPJ do titular"],
  ["pix_key", "Chave PIX"],
  ["notes", "Observações"],
] as const;
export function SupplierEditor({
  vendor,
  dues,
  onSave,
  onClose,
  paid,
}: {
  vendor?: Vendor;
  dues: Due[];
  paid: Record<string, number>;
  onSave: (
    id: string,
    version: number | null,
    values: Record<string, unknown>,
    request: string,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [identifier] = useState(() => vendor?.id || crypto.randomUUID());
  const [name, setName] = useState(vendor?.name || ""),
    [total, setTotal] = useState(moneyInput(vendor?.total_cents || 0)),
    [type, setType] = useState(vendor?.plan_type || "CASH");
  const [details, setDetails] = useState<Record<string, string>>(() => {
    const d = vendor?.details || {};
    return { ...d, pix_key: d.pix_key || supplierPixCandidate(d) || "" };
  });
  const manual = useRef(Boolean(vendor?.details.pix_key));
  const [extras, setExtras] = useState(false),
    [confirmPaid, setConfirmPaid] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [originalDues] = useState(() =>
    [...dues].sort(
      (a, b) => a.position - b.position || a.id.localeCompare(b.id),
    ),
  );
  const [rows, setRows] = useState<DraftDue[]>(() =>
    originalDues.map((d) => ({
      id: d.id,
      label: d.label,
      amount: moneyInput(d.amount_cents),
      date: day(d.due_on),
    })),
  );
  const [quantity, setQuantity] = useState(
      String(Math.max(1, dues.length - (vendor?.plan_type === "DOWN" ? 1 : 0))),
    ),
    [down, setDown] = useState(
      type === "DOWN" ? rows[0]?.amount || "0,00" : "0,00",
    ),
    [first, setFirst] = useState(rows[0]?.date || day(todaySP()));
  const lock = useRef(false),
    request = useRef({ body: "", id: crypto.randomUUID() });
  const generate = (nextType = type, count = Number(quantity)) => {
    try {
      const amount = cents(total),
        entry = nextType === "DOWN" ? cents(down) : 0,
        n = nextType === "CASH" ? 1 : count;
      if (!Number.isInteger(n) || n < 1 || n > 120 || entry > amount)
        throw Error("Confira a quantidade e o valor da entrada.");
      const base = isoDate(first),
        available = amount - entry;
      const parts = splitCents(available, n);
      const result: DraftDue[] = [];
      if (nextType === "DOWN")
        result.push({
          id:
            originalDues.find((r) => r.label === "Entrada")?.id ||
            rows.find((r) => r.label === "Entrada")?.id ||
            crypto.randomUUID(),
          label: "Entrada",
          amount: moneyInput(entry),
          date: first,
        });
      for (let i = 0; i < n; i++)
        result.push({
          id:
            originalDues.filter((r) => r.label !== "Entrada")[i]?.id ||
            rows.filter((r) => r.label !== "Entrada")[i]?.id ||
            crypto.randomUUID(),
          label: nextType === "CASH" ? "À vista" : `Parcela ${i + 1}`,
          amount: moneyInput(parts[i]!),
          date: day(monthlyDate(base, i + (nextType === "DOWN" ? 1 : 0))),
        });
      setRows(result);
      setError("");
    } catch (e) {
      setError(simpleError(e));
    }
  };
  const editRow = (id: string, key: keyof DraftDue, value: string) =>
    setRows((old) =>
      old.map((r) => (r.id === id ? { ...r, [key]: value } : r)),
    );
  let plan = 0,
    contract = 0;
  try {
    plan = sum(rows.map((r) => cents(r.amount)));
    contract = cents(total);
  } catch {
    /* Invalid input is explained on submit. */
  }
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!name.trim()) throw Error("Informe o nome do fornecedor.");
      const amount = cents(total);
      const info = { ...details };
      for (const key of ["tax_id", "holder_tax_id"]) {
        info[key] = (info[key] || "").replace(/\D/g, "");
        if (info[key] && !validTax(info[key]))
          throw Error("Confira o CPF/CNPJ informado.");
      }
      if (info.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email.trim()))
        throw Error("Confira o e-mail informado.");
      info.email = (info.email || "").trim();
      info.pix_key = pixKey(info.pix_type || "", info.pix_key || "");
      const dueRows =
        amount === 0
          ? []
          : rows.map((r, i) => ({
              id: r.id,
              label: r.label,
              amount_cents: cents(r.amount),
              due_on: isoDate(r.date),
              position: i,
            }));
      if (
        amount > 0 &&
        (!dueRows.length || dueRows.some((d) => d.amount_cents <= 0))
      )
        throw Error("Defina vencimentos com valores maiores que zero.");
      if (sum(dueRows.map((d) => d.amount_cents)) !== amount)
        throw Error(
          "A soma do plano deve corresponder ao valor total do contrato.",
        );
      const values = {
        name: name.trim(),
        details: info,
        total_cents: amount,
        plan_type: type,
        dues: dueRows,
        confirm_paid: confirmPaid,
      };
      const body = JSON.stringify(values);
      if (body !== request.current.body)
        request.current = { body, id: crypto.randomUUID() };
      await onSave(
        identifier,
        vendor?.version ?? null,
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
  };
  return (
    <AdminModal
      title={vendor ? "Editar fornecedor" : "Cadastrar fornecedor"}
      onClose={onClose}
      dismissible={!busy}
      contentWidth={760}
    >
      <Field
        label="Nome/Nome empresarial"
        value={name}
        onChangeText={setName}
        editable={!busy}
      />
      <Field
        label="Valor total do contrato"
        value={total}
        onChangeText={(v) => {
          setTotal(v);
          if (type === "CASH")
            setRows((old) => [
              {
                id: old[0]?.id || crypto.randomUUID(),
                label: "À vista",
                amount: v,
                date: first,
              },
            ]);
        }}
        keyboardType="decimal-pad"
        editable={!busy}
      />
      <Toggle
        label="Contatos e dados bancários (opcionais)"
        value={extras}
        onChange={setExtras}
      />
      {extras ? (
        <>
          <Select
            label="Tipo de chave PIX"
            value={details.pix_type || ""}
            onChange={(value) => {
              manual.current = false;
              setDetails((d) => updateSupplierPix(d, "pix_type", value, false));
            }}
            options={[
              { value: "", label: "Sem chave PIX" },
              { value: "CPF", label: "CPF" },
              { value: "CNPJ", label: "CNPJ" },
              { value: "PHONE", label: "Telefone (+DDI)" },
              { value: "EMAIL", label: "E-mail" },
              { value: "RANDOM", label: "Chave aleatória" },
            ]}
            disabled={busy}
          />
          {extraFields.map(([key, label]) => (
            <Field
              key={key}
              label={label}
              value={details[key] || ""}
              onChangeText={(v) => {
                if (key === "pix_key") manual.current = true;
                setDetails((d) => updateSupplierPix(d, key, v, manual.current));
              }}
              onBlur={() => {
                if (key === "tax_id" || key === "holder_tax_id")
                  setDetails((d) =>
                    updateSupplierPix(
                      d,
                      key,
                      maskTax(d[key] || ""),
                      manual.current,
                    ),
                  );
              }}
              editable={!busy}
              multiline={key === "notes"}
              maxLength={4000}
            />
          ))}
        </>
      ) : null}
      <Text style={styles.heading}>Plano financeiro</Text>
      <Choice
        value={type}
        onChange={(v) => {
          const t = v as Vendor["plan_type"];
          setType(t);
          generate(t);
        }}
        options={[
          { value: "CASH", label: "À vista" },
          { value: "DOWN", label: "Entrada + parcelas" },
          { value: "INSTALLMENTS", label: "Somente parcelas" },
        ]}
      />
      {type === "DOWN" ? (
        <Field
          label="Valor da entrada"
          value={down}
          onChangeText={(v) => {
            setDown(v);
            setRows((old) =>
              old.map((r) => (r.label === "Entrada" ? { ...r, amount: v } : r)),
            );
          }}
          keyboardType="decimal-pad"
          editable={!busy}
        />
      ) : null}
      <Field
        label={
          type === "DOWN"
            ? "Data da entrada (DD/MM/AAAA)"
            : "Primeiro vencimento (DD/MM/AAAA)"
        }
        value={first}
        onChangeText={(v) => {
          const date = maskDate(v);
          setFirst(date);
          if (type === "CASH" || type === "DOWN")
            setRows((old) => old.map((r, i) => (i === 0 ? { ...r, date } : r)));
        }}
        editable={!busy}
      />
      {type !== "CASH" ? (
        <Field
          label="Quantidade de parcelas"
          value={quantity}
          onChangeText={(v) => {
            setQuantity(v);
            if (/^\d+$/.test(v) && Number(v) > 0 && Number(v) <= 120)
              generate(type, Number(v));
          }}
          keyboardType="number-pad"
          editable={!busy}
        />
      ) : null}
      <Button
        title={
          type === "CASH"
            ? "Definir pagamento à vista"
            : "Distribuir saldo igualmente"
        }
        secondary
        onPress={() => generate()}
        disabled={busy}
      />
      {rows.map((r, i) =>
        type === "CASH" || (type === "DOWN" && i === 0) ? (
          <Text key={r.id} style={styles.text}>
            {r.label}: {r.amount} · {r.date}
          </Text>
        ) : (
          <View
            key={r.id}
            style={{
              gap: 8,
              borderWidth: 1,
              borderColor: styles.card.borderColor,
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Field
              label={`Descrição ${i + 1}`}
              value={r.label}
              onChangeText={(v) => editRow(r.id, "label", v)}
              editable={!busy}
            />
            <Field
              label={`Valor ${i + 1}`}
              value={r.amount}
              onChangeText={(v) => editRow(r.id, "amount", v)}
              keyboardType="decimal-pad"
              editable={!busy}
            />
            <Field
              label={`Vencimento ${i + 1} (DD/MM/AAAA)`}
              value={r.date}
              onChangeText={(v) => editRow(r.id, "date", maskDate(v))}
              editable={!busy}
            />
            {paid[r.id] ? (
              <Text style={styles.small}>
                Pago: {money(paid[r.id]!)}. O registro será preservado.
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[-1, 1].map((direction) => (
                <Button
                  key={direction}
                  title={`Mover vencimento ${i + 1} para ${direction < 0 ? "cima" : "baixo"}`}
                  secondary
                  disabled={
                    busy ||
                    i + direction < (type === "DOWN" ? 1 : 0) ||
                    i + direction >= rows.length
                  }
                  onPress={() =>
                    setRows((previous) => {
                      const next = [...previous];
                      [next[i], next[i + direction]] = [
                        next[i + direction]!,
                        next[i]!,
                      ];
                      return next;
                    })
                  }
                />
              ))}
            </View>
            <Button
              title={`Excluir vencimento ${i + 1}`}
              secondary
              disabled={busy || !!paid[r.id]}
              onPress={() => setRows((old) => old.filter((x) => x.id !== r.id))}
            />
          </View>
        ),
      )}
      <Button
        title="Adicionar vencimento"
        secondary
        disabled={busy}
        onPress={() =>
          setRows((old) => [
            ...old,
            {
              id: crypto.randomUUID(),
              label: `Parcela ${old.length + 1}`,
              amount: "0,00",
              date: first,
            },
          ])
        }
      />
      <Text style={styles.text}>Total do contrato: {money(contract)}</Text>
      <Text style={styles.text}>Total do plano financeiro: {money(plan)}</Text>
      <Text style={plan !== contract ? styles.error : styles.small}>
        Diferença: {money(contract - plan)}
      </Text>
      {Object.values(paid).some((v) => v > 0) ? (
        <Toggle
          label="Confirmo o ajuste do plano que possui pagamentos registrados"
          value={confirmPaid}
          onChange={setConfirmPaid}
        />
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button title="Salvar fornecedor" onPress={save} disabled={busy} />
      <Button title="Cancelar" secondary onPress={onClose} disabled={busy} />
    </AdminModal>
  );
}
