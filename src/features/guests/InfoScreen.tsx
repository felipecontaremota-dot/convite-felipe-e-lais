import { Text } from "react-native";
import { Card, Screen, styles } from "../../components/ui";

export function InfoScreen() {
  return (
    <Screen section="guest" title="Informações & privacidade">
      <Card>
        <Text style={styles.heading}>O nosso dia</Text>
        <Text style={styles.text}>
          15/12/2026, às 16h, no fuso America/Sao_Paulo. Local e orientações
          serão publicados pelos noivos.
        </Text>
        <Text style={styles.heading}>Seus dados</Text>
        <Text style={styles.text}>
          Usamos nome, resposta de presença, contato opcional, restrições
          informadas e registro de entrada para organizar a celebração. Contatos
          não integram o QR. Mensagens privadas são acessíveis somente à família
          e aos noivos.
        </Text>
        <Text style={styles.text}>
          Você pode revogar consentimentos no Perfil e pedir correção ou
          exclusão aos noivos pela área Mensagens. No aparelho, Sair remove a
          sessão, convites e cache da conta. Uma política completa, responsável
          e prazo de retenção devem ser definidos antes do lançamento público.
        </Text>
      </Card>
    </Screen>
  );
}
