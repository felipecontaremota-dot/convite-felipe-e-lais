import { useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import {
  Button,
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
import { copyText, openExternal } from "../../utils/externalLinks";
import { safeHttps } from "../../utils/security";
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
function ListCard({
  list,
  onEdit,
  onDelete,
}: {
  list: Gift;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const feedback = useFeedback();
  const url = safeHttps(list.external_url);
  return (
    <View
      testID="gift-list-card"
      style={[styles.card, { padding: 16, gap: 8 }]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={[styles.heading, { flex: 1, minWidth: 0 }]}>
          {list.title}
        </Text>
        <View style={{ flexDirection: "row", gap: 4 }}>
          <View style={{ minWidth: 44 }}>
            <IconButton
              icon="edit"
              label={`Editar lista ${list.title}`}
              onPress={onEdit}
            />
          </View>
          <View style={{ minWidth: 44 }}>
            <IconButton
              icon="delete"
              label={`Excluir lista ${list.title}`}
              onPress={onDelete}
            />
          </View>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {url && Platform.OS === "web" ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              minWidth: 0,
              overflowWrap: "anywhere",
              fontSize: 16,
              lineHeight: "25px",
              color: "#183F35",
              textDecoration: "underline",
            }}
          >
            {list.external_url}
          </a>
        ) : url ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={list.external_url!}
            onPress={() => feedback.run(() => openExternal(url))}
            style={{ flex: 1, minWidth: 0 }}
          >
            <Text style={[styles.text, { textDecorationLine: "underline" }]}>
              {list.external_url}
            </Text>
          </Pressable>
        ) : (
          <Text style={[styles.text, { flex: 1 }]}>{list.external_url}</Text>
        )}
        <View style={{ minWidth: 44 }}>
          <IconButton
            icon="copy"
            label={`Copiar link de ${list.title}`}
            onPress={() =>
              feedback.run(async () => {
                if (!list.external_url)
                  throw new AppError("Link indisponível.");
                await copyText(list.external_url);
                return "Link copiado";
              })
            }
          />
        </View>
      </View>
      {feedback.node}
    </View>
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
        style={[styles.button, { alignSelf: "flex-start" }]}
      >
        <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
          + Adicionar lista
        </Text>
      </Pressable>
      {!lists.length ? (
        <Empty text="Cadastre sua primeira lista de presentes pelo botão +." />
      ) : null}
      {lists.map((list) => (
        <ListCard
          key={list.id}
          list={list}
          onEdit={() => setEditing(list)}
          onDelete={() => setDeleting(list)}
        />
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
