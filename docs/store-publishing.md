# Publicação futura

A tarefa prepara configuração, não publica nas lojas. Não acessa Apple/Google ou contas de convidados. Expo SDK e libs nativas usam pins compatíveis. Para desenvolvimento, Expo Go pode demonstrar partes da UI; scanner/push e comportamento offline devem ser validados em development builds e aparelhos reais.

## EAS e identidade

- Criar projeto Expo/EAS e configurar EXPO_PUBLIC_EAS_PROJECT_ID; vincular com `eas init` em uma etapa futura autorizada.
- Revisar IOS_BUNDLE_ID e ANDROID_PACKAGE_ID (defaults provisórios `com.felipeelais.convite`) antes do primeiro build; não trocar IDs depois da distribuição.
- Usar `eas build --profile development`, preview para teste interno e production para artefatos finais. `eas.json` já separa os perfis e versão remota.
- Desabilitar EXPO_PUBLIC_DEMO_MODE e configurar Supabase de produção. Release já bloqueia demo por `__DEV__`, mas não deve receber dados de demonstração.
- Criar ícone 1024, splash e screenshots definitivos. O projeto usa uma identidade tipográfica provisória, sem arte antiga.

## Links universais

EXPO_PUBLIC_WEB_BASE_URL define o domínio HTTPS; `felipeelais://c/<code>` é o esquema nativo. O app.config cria associatedDomains iOS e intentFilters Android quando existe domínio configurado. O mesmo link HTTPS só abrirá o app instalado após publicar:

- `/.well-known/apple-app-site-association`, com Team ID e bundle ID reais e regra de `/c/*`;
- `/.well-known/assetlinks.json`, com package ID e SHA-256 reais do certificado de assinatura Android.

Não se inventam Team ID, certificados ou domínio. Configure o hosting para servir esses documentos sem redirects incorretos e fallback SPA para `/c/*`. HTTPS, manifest e service worker são necessários à PWA; não cachear APIs/convites no service worker. Push web não faz parte da fundação.

## Apple

- Apple Developer ativo, App Store Connect, certificados/provisioning e APNs.
- TestFlight interno/externo em aparelhos reais; testar câmera negada, fonte grande, deep links, offline e reconexão.
- Review account autorizada e convite de teste com dados fictícios no backend de revisão, sem bypass administrativo de produção.
- App Privacy, política pública, retenção/exclusão e declarações de câmera/notificações.
- Screenshots de tamanhos exigidos, descrição, suporte, categoria, classificação etária e formulário de criptografia.

## Google

- Google Play Console, Play App Signing, AAB e internal testing.
- FCM configurado para EAS/Expo Push e permissões de câmera/notificações revisadas.
- Data Safety, política de privacidade, exclusão de dados, screenshots/ícone/descrição e requisitos de target SDK vigentes na data do envio.
- Conta de revisão e fluxo de convite fictício; não distribuir service role ou credenciais privadas no bundle.

## Gate de lançamento

Validar build nativo assinado, câmera real, push APNs/FCM, persistência após reinício, perda de rede, links instalados/desinstalados, concorrência entre dois aparelhos e acessibilidade em VoiceOver/TalkBack. Testes web e export JS não substituem esses testes. Domínio, endereço do casamento, texto/política finais e todas as credenciais dependem dos responsáveis. Não fazer submit até uma tarefa futura de publicação autorizada.
