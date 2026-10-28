import { contractStates, day, money } from "./domain";
export function historyLabel(action: string) {
  return (
    (
      {
        SUPPLIER_SAVE: "Fornecedor cadastrado ou atualizado",
        DOCUMENT_SAVE: "Identificação do documento atualizada",
        SUPPLIER_ARCHIVE: "Fornecedor arquivado",
        ENTRY_SAVE: "Despesa/contrato atualizado",
        ENTRY_ARCHIVE: "Lançamento arquivado",
        INSTALLMENT_SAVE: "Parcela atualizada",
        INSTALLMENT_ARCHIVE: "Parcela arquivada",
        PAYMENT_SAVE: "Pagamento registrado ou editado",
        PAYMENT_ARCHIVE: "Registro de pagamento cancelado",
        BUDGET_SAVE: "Orçamento global alterado",
        DOCUMENT_UPLOAD: "Documento anexado",
        DOCUMENT_ARCHIVE: "Documento excluído",
        CREATE: "Parcela criada",
      } as Record<string, string>
    )[action] || "Planejamento atualizado"
  );
}
export function financialHistory(value: unknown) {
  if (!value || typeof value !== "object") return "—";
  return Object.entries(value)
    .map(
      ([k, v]) =>
        `${({ amount_cents: "Valor", agreed_cents: "Contratado", discount_cents: "Desconto", settlement_cents: "Obrigação no cancelamento", estimated_cents: "Previsto", status: "Situação", due_on: "Vencimento", paid_on: "Data do pagamento" } as Record<string, string>)[k] || k}: ${k.endsWith("_cents") ? money(Number(v)) : k === "status" ? contractStates[v as keyof typeof contractStates] || String(v) : day(String(v))}`,
    )
    .join(" · ");
}
export const historyFields: Record<string, string> = {
  name: "Nome",
  responsible: "Responsável",
  tax_id: "CPF/CNPJ",
  category: "Categoria",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  website: "Site ou Instagram",
  address: "Endereço",
  pix_type: "Tipo de chave PIX",
  pix_key: "Chave PIX",
  holder_name: "Titular",
  holder_tax_id: "CPF/CNPJ do titular",
  bank: "Banco",
  agency: "Agência",
  account: "Conta",
  notes: "Observações",
  kind: "Modalidade",
  title: "Título",
  description: "Descrição",
  supplier_id: "Fornecedor",
  status: "Situação",
  contracted_on: "Contratação",
  delivery_on: "Entrega/execução",
  estimated_cents: "Valor previsto",
  agreed_cents: "Valor contratado",
  discount_cents: "Desconto",
  settlement_cents: "Obrigação no cancelamento",
  payment_method: "Forma prevista de pagamento",
  financial_notes: "Observações financeiras",
  entry_id: "Despesa/contrato",
  position: "Ordem",
  amount_cents: "Valor",
  due_on: "Vencimento",
  installment_id: "Parcela",
  paid_on: "Data efetiva do pagamento",
  method: "Forma de pagamento",
};
