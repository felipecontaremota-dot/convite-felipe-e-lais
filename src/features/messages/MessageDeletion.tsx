import { ConfirmModal } from "../../components/AdminModal";
import { useApp } from "../../lib/AppProvider";
import type { Message } from "../../types/domain";
export function MessageDeletion({
  message,
  onClose,
}: {
  message: Message;
  onClose: () => void;
}) {
  const app = useApp();
  if (!app.data?.capabilities?.messaging_v2) return null;
  return (
    <ConfirmModal
      title="Excluir mensagem?"
      premium
      text="Tem certeza que deseja excluir esta mensagem? Esta ação não poderá ser desfeita pela interface."
      confirmLabel="Excluir"
      onCancel={onClose}
      onConfirm={async () => {
        await app.admin("MESSAGE_DELETE", { id: message.id });
        onClose();
      }}
    />
  );
}
