import { useRef, useState } from "react";
import { Pressable, Text } from "react-native";
import {
  Button,
  Card,
  Empty,
  Field,
  Screen,
  styles,
  useFeedback,
} from "../../components/ui";
import { Confirmation, IconButton } from "../../components/adminUi";
import { AdminModal } from "../../components/AdminModal";
import { useApp } from "../../lib/AppProvider";
import { AppError } from "../../lib/errors";
import type { Gift } from "../../types/domain";
import { FIRST_LIST, giftLists, giftListPayload } from "./giftLists";

function ListEditor({
  gift,
  first,
  onClose,
}: {
  gift?: Gift;
  first: boolean;
  onClose: () => void;
}) {
  const app = useApp(),
    feedback = useFeedback();
  const [title, setTitle] = useState(
    gift?.title ?? (first ? FIRST_LIST.title : ""),
  );
  const [url, setUrl] = useState(
    gift?.external_url ?? (first ? FIRST_LIST.url : ""),
  );
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  return (
    <AdminModal
      title={gift ? "Editar lista" : "Adicionar lista"}
      onClose={onClose}
      dismissible={!saving}
    >
      <Field
        label="Título da lista"
        value={title}
        onChangeText={setTitle}
        maxLength={200}
      />
      <Field
        label="Link da lista"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
      <Button
        title="Salvar lista"
        disabled={saving || !title.trim() || !url.trim()}
        onPress={async () => {
          if (submitting.current) return;
          submitting.current = true;
          setSaving(true);
          try {
            await feedback.run(async () => {
              const payload = giftListPayload(title, url, gift);
              if (!payload)
                throw new AppError("Informe um título e um link HTTPS válido.");
              await app.admin("GIFT_SAVE", payload);
              onClose();
            });
          } finally {
            submitting.current = false;
            setSaving(false);
          }
        }}
      />
      <Button secondary title="Cancelar" disabled={saving} onPress={onClose} />
      {feedback.node}
    </AdminModal>
  );
}
export function AdminGifts() {
  const app = useApp();
  const lists = giftLists(app.data?.gifts);
  const [editing, setEditing] = useState<Gift | "new" | null>(null);
  const [deleting, setDeleting] = useState<Gift | null>(null);
  return (
    <Screen section="admin" title="Nossas listas de presentes">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Adicionar lista"
        onPress={() => setEditing("new")}
        style={styles.button}
      >
        <Text style={{ color: "white", fontSize: 24 }}>+</Text>
      </Pressable>
      {!lists.length ? (
        <Empty text="Cadastre sua primeira lista de presentes pelo botão +." />
      ) : null}
      {lists.map((list) => (
        <Card key={list.id}>
          <Text style={styles.heading}>{list.title}</Text>
          <Text style={styles.text}>{list.external_url}</Text>
          <IconButton
            icon="edit"
            label={`Editar lista ${list.title}`}
            onPress={() => setEditing(list)}
          />
          <IconButton
            icon="delete"
            label={`Excluir lista ${list.title}`}
            onPress={() => setDeleting(list)}
          />
        </Card>
      ))}
      {editing ? (
        <ListEditor
          key={editing === "new" ? "new" : editing.id}
          gift={editing === "new" ? undefined : editing}
          first={!lists.length}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <Confirmation
          text={`Excluir a lista “${deleting.title}”?`}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await app.admin("GIFT_DELETE", {
              id: deleting.id,
              version: deleting.version,
            });
            setDeleting(null);
          }}
        />
      ) : null}
    </Screen>
  );
}
