import { eventId, supabase } from "../../lib/supabase";
import type { PlanningDocument } from "./domain";
export async function uploadDocument(
  file: File,
  target: { supplier_id?: string; entry_id?: string; payment_id?: string },
  id: string,
  request: string,
) {
  if (!supabase) throw Error("Armazenamento indisponível.");
  if (
    !file.size ||
    file.size > 10485760 ||
    !/\.(pdf|jpe?g|png)$/i.test(file.name)
  )
    throw Error("Use PDF, JPG ou PNG até 10 MB.");
  const form = new FormData();
  form.set("event_id", eventId);
  form.set("id", id);
  form.set("request_id", request);
  form.set("file", file);
  for (const [key, value] of Object.entries(target))
    if (value) form.set(key, value);
  const { error } = await supabase.functions.invoke("planning-documents", {
    body: form,
  });
  if (error)
    throw Error(
      "Não foi possível validar ou salvar o documento. Confira o arquivo e tente novamente.",
    );
}
export async function downloadDocument(document: PlanningDocument) {
  if (!supabase) throw Error("Armazenamento indisponível.");
  const { data, error } = await supabase.storage
    .from("wedding-planning")
    .download(`${eventId}/${document.id}`);
  if (error || !data)
    throw Error(
      "Não foi possível abrir o documento. Atualize os dados e tente novamente.",
    );
  return data;
}
