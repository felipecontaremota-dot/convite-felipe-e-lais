import { useState } from "react";
import {
  Button,
  Card,
  Field,
  Screen,
  Toggle,
  useFeedback,
} from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { AppError } from "../../lib/errors";
import type { Gift } from "../../types/domain";
import { safeHttps } from "../../utils/security";

function GiftEditor({ gift }: { gift?: Gift }) {
  const app = useApp(),
    feedback = useFeedback();
  const [title, setTitle] = useState(gift?.title || ""),
    [description, setDescription] = useState(gift?.description || ""),
    [image, setImage] = useState(gift?.image_url || ""),
    [url, setUrl] = useState(gift?.external_url || ""),
    [price, setPrice] = useState(gift?.price_label || ""),
    [order, setOrder] = useState(String(gift?.sort_order || 0)),
    [active, setActive] = useState(gift?.active ?? true),
    [reservation, setReservation] = useState(
      gift?.reservation_enabled ?? false,
    ),
    [confirm, setConfirm] = useState(false);
  return (
    <Card>
      <Field label="Título do presente" value={title} onChangeText={setTitle} />
      <Field
        label="Descrição"
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <Field
        label="URL da imagem HTTPS"
        value={image}
        onChangeText={setImage}
        autoCapitalize="none"
      />
      <Field
        label="Link externo HTTPS"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
      />
      <Field label="Preço / legenda" value={price} onChangeText={setPrice} />
      <Field
        label="Ordem"
        value={order}
        onChangeText={setOrder}
        keyboardType="number-pad"
      />
      <Toggle label="Presente ativo" value={active} onChange={setActive} />
      <Toggle
        label="Preparar reserva (sem pagamento)"
        value={reservation}
        onChange={setReservation}
      />
      <Button
        title={gift ? "Salvar presente" : "Criar presente"}
        disabled={!title.trim()}
        onPress={() =>
          feedback.run(async () => {
            if (
              (url && !safeHttps(url)) ||
              (image && !safeHttps(image)) ||
              !Number.isFinite(Number(order))
            )
              throw new AppError(
                "Informe URLs HTTPS válidas e ordem numérica.",
              );
            await app.admin("GIFT_SAVE", {
              id: gift?.id,
              version: gift?.version,
              title: title.trim(),
              description,
              image_url: image || null,
              external_url: url || null,
              price_label: price,
              sort_order: Number(order),
              active,
              reservation_enabled: reservation,
            });
            if (!gift) {
              setTitle("");
              setDescription("");
            }
          })
        }
      />
      {gift ? (
        <>
          <Toggle
            label="Confirmo a exclusão deste presente"
            value={confirm}
            onChange={setConfirm}
          />
          <Button
            secondary
            title="Excluir presente"
            disabled={!confirm}
            onPress={() =>
              feedback.run(() =>
                app.admin("GIFT_DELETE", {
                  id: gift.id,
                  version: gift.version,
                }),
              )
            }
          />
        </>
      ) : null}
      {feedback.node}
    </Card>
  );
}

export function AdminGifts() {
  const app = useApp();
  return (
    <Screen section="admin" title="Nossa lista de presentes">
      <GiftEditor />
      {app.data?.gifts.map((g) => (
        <GiftEditor key={g.id} gift={g} />
      ))}
    </Screen>
  );
}
