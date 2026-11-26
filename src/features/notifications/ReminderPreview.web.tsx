export function ReminderPreview({ html }: { html: string; text: string }) {
  return (
    <iframe
      title="Pré-visualização fictícia do e-mail de 10 dias"
      sandbox=""
      srcDoc={html}
      style={{ width: "100%", height: 640, border: 0, maxWidth: 640 }}
    />
  );
}
