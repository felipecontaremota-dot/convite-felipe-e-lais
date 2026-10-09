# Validação desta implementação — 09/10/2026

| Comando / verificação                         | Resultado                                                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm ci                                        | Instalação com lockfile concluída                                                                                                                                |
| npm run typecheck                             | Passou, TypeScript estrito                                                                                                                                       |
| npm run lint                                  | Passou                                                                                                                                                           |
| npm test                                      | 37 testes de domínio passaram                                                                                                                                    |
| npm run check:functions                       | Três Edge Functions compilaram com Deno                                                                                                                          |
| npm run test:functions                        | 9 testes de providers com HTTP simulado passaram; nenhum envio real                                                                                              |
| npm run test:db                               | Migrations/seed e testes PostgreSQL 17 passaram: RLS, isolamento, papéis, RSVP, QR/hash/revogação, check-in, deduplicação, conflitos, rate limit, outbox e audit |
| npm run test:e2e                              | 5 fluxos Chromium passaram; celular 390×844, tablet 820×1180 e desktop 1440×900 sem overflow                                                                     |
| npm run build:web                             | Export SPA concluído                                                                                                                                             |
| npm run serve:web + npm run test:export       | Shell PWA offline, fallback /c, demo bloqueado em release e ausência de cache de URLs privadas verificados                                                       |
| expo export --platform android --platform ios | Bundles Hermes das duas plataformas exportados                                                                                                                   |
| npm run import:report                         | Fixture de 3 linhas: 1 inválida, 1 possível duplicata, applied=0; relatório 0600                                                                                 |
| Geração UUID Xcode                            | API v4 preservada com override uuid 11.1.1                                                                                                                       |
| Busca de credenciais reais / git diff --check | Nenhum segredo real encontrado; sem erros de whitespace                                                                                                          |
| npm audit --omit=dev --audit-level=high       | **Falhou**: 21 alertas, 18 high e 3 moderate; veja security.md                                                                                                   |

Na máquina de nuvem, npm usou cache em /tmp/wedding-npm, Deno em /tmp/wedding-deno, Expo usou EXPO_NO_TELEMETRY=1/EXPO_NO_CACHE=1 e Playwright usou Chromium instalado via PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium. O download automático de Chromium foi bloqueado por egress, resolvido usando o navegador já disponível. Tests E2E usam demo explícito e variáveis Supabase vazias, sem acesso a produção.

Não executados por depender de configuração externa: Supabase hospedado/OTP/SMTP/gateway, scheduler remoto, envio push/APNs/FCM, e-mail e WhatsApp reais, acesso à planilha real, builds nativos assinados ou aparelhos físicos. PostgreSQL usa um Auth stub para verificar SQL/RLS; não substitui um projeto Supabase de homologação.

Não houve publicação nas lojas, deploy remoto, alteração de planilha ou envio real. A base funciona para desenvolvimento/demonstração; pendências de credenciais, privacidade final, device tests e advisories precisam ser resolvidas antes de lançamento.
