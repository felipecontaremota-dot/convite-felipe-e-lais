import { MessageComposerInput } from "./MessageComposerInput";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Platform, Pressable, Text, View } from "react-native";
import { Button, styles } from "../../components/ui";
import { UnreadBadge } from "../../components/UnreadBadge";
import { useApp } from "../../lib/AppProvider";
import { theme } from "../../theme/tokens";
import type { Channel, Message } from "../../types/domain";
import { ChannelChoices } from "../notifications/ChannelChoices";
import { conversationList, messageDate } from "./conversations";
import { AdminReplyComposer } from "./AdminConversation";
import { ChatWindow } from "./ChatWindow";
import { MessageHistory } from "./MessageHistory";
import { MessageDeletion } from "./MessageDeletion";
import { SendMessageButton } from "./SendMessageButton";
import { useMessageCenter } from "./MessageCenterContext";
import { useMessageComposer } from "./useMessageComposer";
function GeneralComposer() {
  const app = useApp(),
    composer = useMessageComposer({ quietSuccess: true });
  const [content, setContent] = useState(""),
    [channels, setChannels] = useState<Channel[]>(["IN_APP"]);
  const ids = (app.data?.guests || [])
    .filter((g) =>
      app.data?.invitations.some(
        (i) => i.id === g.invitation_id && i.active && !i.archived_at,
      ),
    )
    .map((g) => g.id);
  return (
    <View style={{ gap: 8 }}>
      {!app.data?.capabilities?.messaging_v2 ? (
        <Text style={styles.small}>
          O novo histórico geral aguarda atualização do backend. O envio legado
          permanece em Envio para família ou pessoa.
        </Text>
      ) : null}
      <ChannelChoices value={channels} onChange={setChannels} />
      <MessageComposerInput
        label="Mensagem para todos"
        hideLabel
        placeholder="Escreva uma mensagem para todos"
        value={content}
        onChangeText={setContent}
      >
        <SendMessageButton
          label="Enviar mensagem para todos"
          busy={composer.busy}
          disabled={
            !app.data?.capabilities?.messaging_v2 ||
            !content.trim() ||
            !channels.length ||
            !ids.length ||
            ids.length > 500
          }
          onPress={() =>
            void composer.send(
              "MESSAGE_SEND_TO_GUESTS",
              {
                content: content.trim(),
                recipient_guest_ids: ids,
                create_announcement: channels.includes("IN_APP"),
                audience: "GENERAL",
                channels,
              },
              () => setContent(""),
            )
          }
        />
      </MessageComposerInput>
      {composer.node}
      {app.pending
        .filter((m) => m.type === "MESSAGE_SEND_TO_GUESTS")
        .map((m) => (
          <Text key={m.mutationId} style={styles.small}>
            {String(m.payload.content)} ·{" "}
            {m.lastError
              ? "Falha de sincronização — mensagem pendente"
              : "Pendente de sincronização"}
          </Text>
        ))}
    </View>
  );
}
export function AdminMessageCenter() {
  const app = useApp(),
    center = useMessageCenter();
  const [view, setView] = useState(center.invitation ? "unit" : "list"),
    [selected, setSelected] = useState(center.invitation),
    [selectedAnchor, setSelectedAnchor] = useState(center.anchor),
    [deleting, setDeleting] = useState<Message | null>(null);
  const enhanced = !!app.data?.capabilities?.messaging_v2;
  const list = app.data ? conversationList(app.data) : [];
  const conversation = list.find((c) => c.unit.id === selected);
  const anchor = selectedAnchor
    ? conversation?.messages.find(
        (m) =>
          m.id === selectedAnchor &&
          !m.from_admin &&
          m.invitation_id === selected,
      )
    : conversation?.anchor;
  const title =
    view === "unit"
      ? conversation?.unit.name || "Conversa"
      : view === "general"
        ? "Mensagens para todos"
        : "Mensagens dos convidados";
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const timer = setTimeout(() => {
      document
        .querySelector<HTMLElement>(
          view === "list"
            ? '[data-center-view="list"] [role="button"]'
            : '[data-center-toolbar="true"] [role="button"]',
        )
        ?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [view]);
  const back = (
    <Button
      secondary
      title="Voltar às conversas"
      onPress={() => setView("list")}
    />
  );
  const footer =
    view === "unit" && conversation ? (
      <AdminReplyComposer
        key={conversation.unit.id}
        invitation={conversation.unit.id}
        anchor={anchor}
        blocked={!!selectedAnchor && !anchor}
      />
    ) : view === "general" ? (
      <GeneralComposer />
    ) : (
      <View style={{ gap: 8 }}>
        <View style={{ alignItems: "flex-end" }}>
          <SendMessageButton
            label="Enviar mensagem para todos"
            onPress={() => setView("general")}
          />
        </View>
        <Button
          secondary
          title="Envio para família ou pessoa"
          onPress={() => {
            center.close();
            router.push("/gestao-mensagens");
          }}
        />
      </View>
    );
  return (
    <>
      <ChatWindow
        title={title}
        onClose={center.close}
        footer={footer}
        toolbar={
          view !== "list" ? (
            <View
              {...(Platform.OS === "web"
                ? { dataSet: { centerToolbar: "true" } }
                : {})}
            >
              {back}
            </View>
          ) : undefined
        }
      >
        <View
          key={view + selected}
          {...(Platform.OS === "web" ? { dataSet: { centerView: view } } : {})}
          style={{ gap: 12 }}
        >
          {Platform.OS === "web" ? (
            <style>{`[data-center-view]{animation:wedding-conversation-view 240ms ease-out both;}@keyframes wedding-conversation-view{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:none}}[data-conversation-row]:focus-visible{outline:3px solid ${theme.colors.focus};outline-offset:2px;}[data-conversation-row]:hover{background:${theme.colors.wash}!important;}@media(prefers-reduced-motion:reduce){[data-center-view]{animation:none!important;}}`}</style>
          ) : null}
          {view === "list" ? (
            <>
              {!enhanced ? (
                <Text style={styles.small}>
                  Respostas e exclusão ainda não estão disponíveis neste
                  ambiente. O backend de mensagens precisa ser atualizado.
                </Text>
              ) : null}
              {list.map((c) => (
                <Pressable
                  key={c.unit.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.unit.name}${c.unread ? `, ${c.unread} não lidas` : ""}`}
                  {...(Platform.OS === "web"
                    ? { dataSet: { conversationRow: "true" } }
                    : {})}
                  onPress={() => {
                    setSelected(c.unit.id);
                    setSelectedAnchor(null);
                    setView("unit");
                  }}
                  style={[
                    styles.nav,
                    {
                      gap: 6,
                      backgroundColor: c.unread
                        ? theme.colors.wash
                        : theme.colors.card,
                      paddingRight: 32,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.text,
                      {
                        color: theme.colors.ink,
                        fontWeight: c.unread ? "700" : "600",
                      },
                    ]}
                  >
                    {c.unit.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.small}>
                    {c.latest?.content}
                  </Text>
                  <Text style={styles.small}>
                    {c.latest ? messageDate(c.latest.created_at) : ""}
                  </Text>
                  <UnreadBadge count={c.unread} inset />
                </Pressable>
              ))}
              {!list.length ? (
                <Text style={styles.text}>As conversas aparecerão aqui.</Text>
              ) : null}
            </>
          ) : view === "unit" && conversation ? (
            <MessageHistory
              key={conversation.unit.id}
              messages={conversation.messages}
              onDelete={enhanced ? setDeleting : undefined}
            />
          ) : view === "general" ? (
            <>
              <Text style={styles.text}>
                Por aqui vocês poderão enviar mensagem para todos os convidados
              </Text>
              <MessageHistory
                messages={(app.data?.messages || []).filter(
                  (m) => m.audience === "GENERAL",
                )}
                onDelete={enhanced ? setDeleting : undefined}
              />
              {!enhanced ? (
                <Text style={styles.small}>
                  O histórico antigo continua disponível em Envio para família
                  ou pessoa. Mensagens de alcance desconhecido não são
                  classificadas como gerais.
                </Text>
              ) : null}
              <Text style={styles.small}>
                Canais externos dependem de consentimento e do resultado do
                provedor. Excluir no aplicativo não recupera entregas já
                realizadas.
              </Text>
            </>
          ) : (
            <Text style={styles.error}>
              Esta conversa não está mais disponível. Volte à lista.
            </Text>
          )}
        </View>
      </ChatWindow>
      {deleting ? (
        <MessageDeletion message={deleting} onClose={() => setDeleting(null)} />
      ) : null}
    </>
  );
}
