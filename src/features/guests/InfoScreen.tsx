import { type ReactNode } from "react";
import { Link, type Href } from "expo-router";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Card, Screen, styles } from "../../components/ui";
import { useApp } from "../../lib/AppProvider";
import { theme } from "../../theme/tokens";
import { canAccess } from "../../utils/security";

const infoStyles = StyleSheet.create({
  reading: { width: "100%", maxWidth: 780, alignSelf: "center", gap: 16 },
  paragraph: { lineHeight: 27, textAlign: "left" },
  bold: { fontWeight: "700", color: theme.colors.ink },
  link: { color: theme.colors.primary, textDecorationLine: "underline" },
  section: {
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    paddingTop: 24,
    marginTop: 8,
  },
  topic: {
    color: theme.colors.ink,
    fontSize: 18,
    lineHeight: 28,
    fontWeight: "700",
  },
  signature: {
    gap: 14,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
  },
});
function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Text selectable style={[styles.text, infoStyles.paragraph]}>
      {children}
    </Text>
  );
}
function Bold({ children }: { children: ReactNode }) {
  return <Text style={infoStyles.bold}>{children}</Text>;
}
function InfoLink({
  href,
  children,
  external = false,
}: {
  href: Href;
  children: ReactNode;
  external?: boolean;
}) {
  const app = useApp();
  if (!external && !canAccess(app.data?.role || null, "guest"))
    return <Bold>{children}</Bold>;
  return (
    <Link href={href} asChild>
      <Text style={StyleSheet.flatten([infoStyles.bold, infoStyles.link])}>
        {children}
      </Text>
    </Link>
  );
}
function Topic({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={infoStyles.section}>
      <Text accessibilityRole="header" style={infoStyles.topic}>
        {title}
      </Text>
      {children}
    </View>
  );
}
export function InfoScreen() {
  return (
    <Screen section="guest" title="Informações">
      {Platform.OS === "web" ? (
        <style>{`
        [data-testid="wedding-information"] a { transition: color 180ms ease; }
        [data-testid="wedding-information"] a:hover { color: ${theme.colors.primaryHover}; }
        [data-testid="wedding-information"] a:focus-visible { outline: 3px solid ${theme.colors.focus}; outline-offset: 3px; border-radius: 3px; }
        @media (prefers-reduced-motion: reduce) { [data-testid="wedding-information"] a { transition: none; } }
      `}</style>
      ) : null}
      <Card>
        <View testID="wedding-information" style={infoStyles.reading}>
          <Text accessibilityRole="header" style={styles.heading}>
            O nosso dia
          </Text>
          <Text style={[styles.text, { color: theme.colors.ink }]}>
            15 de dezembro de 2026, às 16h
          </Text>
          <View style={infoStyles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { lineHeight: 32, fontWeight: "700" }]}
            >
              💙💍 Alguns recados importantes para o nosso grande dia!
            </Text>
            <Paragraph>
              Preparamos cada detalhe com muito amor, carinho e uma dose enorme
              de ansiedade! 💕 E sabe o que vai tornar tudo ainda mais especial?{" "}
              <Bold>Ter você celebrando esse momento com a gente!</Bold>
            </Paragraph>
            <Paragraph>
              Mas, antes de colocar o look, preparar o coração e partir para a
              festa, temos alguns recados importantes! 👀✨
            </Paragraph>
          </View>
          <Topic title="📍 1. CERIMÔNIA E FESTA: TUDO NO MESMO LUGAR!">
            <Paragraph>
              A cerimônia e a recepção acontecerão no <Bold>Villarejo</Bold>, um
              espaço lindo, com mais de <Bold>8.800 m²</Bold>, localizado em
              Aparecida de Goiânia, a aproximadamente 3 km do Terminal Araguaia,
              atravessando a BR-153.
            </Paragraph>
            <Paragraph>
              Quer saber como chegar? É só acessar a tela{" "}
              <InfoLink href="/como-chegar">&quot;Local&quot;</InfoLink> do
              nosso convite! Lá você encontra a localização e pode planejar seu
              trajeto com tranquilidade. Só não vale se perder e chegar depois
              da entrada da noiva, hein?!
            </Paragraph>
          </Topic>
          <Topic title="🚗 2. PODE VIR DE CARRO!">
            <Paragraph>
              Não precisa se preocupar com estacionamento! O espaço conta com
              capacidade para até <Bold>100 veículos</Bold>. Então, pode vir
              tranquilo, porque lugar para estacionar não vai faltar! 🅿️✨
            </Paragraph>
          </Topic>
          <Topic title="✅ 3. CONFIRME SUA PRESENÇA! É MUITO IMPORTANTE!">
            <Paragraph>
              Aqui temos um pedido especial:{" "}
              <Bold>
                não esqueça de confirmar sua presença na tela{" "}
                <InfoLink href="/presenca">&quot;Presença&quot;</InfoLink>!
              </Bold>{" "}
              💙
            </Paragraph>
            <Paragraph>
              Nossa lista de convidados é fechada, em razão da organização e dos
              serviços contratados. Por isso, somente poderão acessar o evento
              as pessoas que estiverem devidamente incluídas na lista.
            </Paragraph>
            <Paragraph>
              E tem mais: depois de confirmar sua presença, você terá acesso ao
              seu{" "}
              <Bold>
                QR Code na tela{" "}
                <InfoLink href="/ingressos">&quot;Convites&quot;</InfoLink>
              </Bold>
              , que será utilizado para conferir sua entrada no grande dia! 📲🎟️
            </Paragraph>
            <Paragraph>
              Ou seja:{" "}
              <Bold>confirmou, garantiu seu lugar na nossa celebração!</Bold> 🥳
            </Paragraph>
          </Topic>
          <Topic title="📱 4. MANTENHA SEUS DADOS ATUALIZADOS!">
            <Paragraph>
              Dá uma passadinha na tela{" "}
              <InfoLink href="/perfil">&quot;Perfil&quot;</InfoLink> e confira
              se seu e-mail e número de WhatsApp estão certinhos, combinado?
            </Paragraph>
            <Paragraph>
              Podemos enviar algumas novidades, lembretes e informações
              importantes por esses canais. E ninguém quer ficar de fora dos
              recadinhos da noiva, né?! 😂💌
            </Paragraph>
          </Topic>
          <Topic title="📲 5. NOSSO CONVITE TAMBÉM VIRA UM APP!">
            <Paragraph>
              Simmm! Nosso convite é tão especial que você pode até instalar no
              seu celular! 😍
            </Paragraph>
            <Paragraph>É bem simples:</Paragraph>
            <View accessibilityRole="list" style={{ gap: 10 }}>
              <Paragraph>
                • Acesse{" "}
                <InfoLink href="https://felipeelais2026.com.br" external>
                  www.felipeelais2026.com.br
                </InfoLink>{" "}
                ou o link individual que você recebeu.
              </Paragraph>
              <Paragraph>• Abra o menu do navegador (≡).</Paragraph>
              <Paragraph>
                • Procure a opção <Bold>&quot;Instalar&quot;</Bold> ou{" "}
                <Bold>&quot;Instalar e criar atalho&quot;</Bold>.
              </Paragraph>
              <Paragraph>• Confirme a instalação e pronto! 🎉</Paragraph>
            </View>
            <Paragraph>
              Assim, nosso convite fica pertinho de você, direto na tela do seu
              celular, facilitando o acesso à programação, à localização e a
              todas as novidades!
            </Paragraph>
            <Paragraph>
              <Text style={{ fontStyle: "italic" }}>
                As opções de instalação podem variar conforme o celular e o
                navegador utilizado.
              </Text>
            </Paragraph>
          </Topic>
          <Topic title="🥂 6. E, POR ÚLTIMO, MAS NÃO MENOS IMPORTANTE: DIVIRTA-SE!">
            <Paragraph>Essa é a nossa regra favorita! 💃🕺</Paragraph>
            <Paragraph>
              Venha com o coração leve, a alegria lá em cima e muita disposição
              para comemorar!
            </Paragraph>
            <Paragraph>
              Queremos abraços apertados, muitas risadas, fotos, dança e
              lembranças que vamos guardar para sempre! 📸✨
            </Paragraph>
            <Paragraph>
              <Bold>
                Afinal, o casamento é nosso, mas a festa é de todos nós!
              </Bold>{" "}
              🎉💙
            </Paragraph>
            <Paragraph>
              Estamos imensamente felizes por dividir esse capítulo tão
              importante das nossas vidas com pessoas especiais como você!
            </Paragraph>
          </Topic>
          <View style={infoStyles.signature}>
            <Paragraph>
              <Bold>
                Com muito amor e uma ansiedade que já não cabe no peito,
              </Bold>
            </Paragraph>
            <Paragraph>
              <Bold>Felipe &amp; Laís</Bold> 💍💙
            </Paragraph>
            <Paragraph>
              <Text style={{ fontStyle: "italic" }}>
                15 de dezembro de 2026 — O dia em que nossa história ganha um
                novo capítulo, e você faz parte dele!
              </Text>{" "}
              ✨
            </Paragraph>
          </View>
        </View>
      </Card>
    </Screen>
  );
}
