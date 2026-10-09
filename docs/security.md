# Segurança e privacidade

## Fronteiras

O app usa apenas URL e anon/publicável do Supabase. A service role só é lida em Edge Functions. Nenhuma conta ADMIN, senha, service account ou token de provider está no repositório. `.env.example` contém apenas nomes e configurações não secretas. Variáveis EXPO_PUBLIC são incorporadas ao bundle: não coloque segredos nelas.

Crie usuários autorizados no painel Auth e atribua papéis a UUIDs verificados por um operador confiável, por exemplo via SQL editor:

```sql
insert into public.user_roles(event_id,user_id,role)
values ('00000000-0000-4000-8000-000000000001', '<UUID-DO-USUARIO-AUTH>', 'ADMIN');
```

Use CEREMONIALIST para o cerimonial. Não existe RPC pública para promover papéis. Alterações de user_roles são auditadas. O login normal usa `signInWithPassword`; contas autorizadas já devem existir. Preserve SMTP/Resend para recuperação e comunicações futuras, limites de envio e cadastro fechado. Troca da própria senha usa Supabase Auth. Veja [configuração e primeira senha](access-families.md). O papel não é inferido de e-mail informado.

Convidados usam Anonymous Auth persistente e validação server-side de código de 192 bits + PIN de quatro dígitos. O hash do código permanece em invitations; PIN e código de compartilhamento dos links novos ficam em invitation_access, com RLS exclusivo ADMIN, para permitir copiar o convite. Esses campos nunca entram no snapshot de convidados/cerimonial. A Edge Function verifica JWT com Auth getUser; não aceita user_id ou invitation_id do cliente. A RPC de vinculação só é executável pelo service role e recebe UUID do usuário verificado. Limites de quinze tentativas por usuário/endereço/código em quinze minutos, e teto global por evento, reduzem enumeração. Retorno false, em vez de exception, mantém contadores de tentativas malsucedidas.

O endereço de origem usado pelo worker deve ser garantido pelo gateway (`x-real-ip`); um header controlado pelo cliente não é uma identidade confiável. Antes de exposição pública, ative CAPTCHA/rate limits em signup anônimo e WAF/gateway, confirme normalização dos headers e teste abuso com usuários rotacionados. Limite global continua atuando, mas pode causar negação de serviço se usado sozinho. O ADMIN pode sugerir os quatro últimos dígitos do WhatsApp como PIN; isso não comprova identidade individual e exige também o link aleatório.

## Autorização

Guards de UI são conveniência. PostgreSQL valida papel e evento em cada operação, vínculo ativo e pertença do integrante. FK compostas impedem referências entre eventos. Tabelas não concedem writes aos clientes. RLS habilitada e RPCs com search_path fixo/revogação de EXECUTE PUBLIC limitam o acesso. Cerimonial recebe apenas snapshot necessário; nunca conteúdo de mensagens/contatos/dietary.

Convite é uma capacidade familiar compartilhada. Quem possui o link e PIN pode vincular dispositivo e agir pelos integrantes. Nome escolhido no Perfil identifica o emissor, não prova identidade. Códigos não devem aparecer em logs ou analytics. Rotação, bloqueio/desativação, junção ou movimentação invalidam vínculos afetados; QR movido é revogado. Em caso de compartilhamento indevido, gere novo código e envie apenas aos destinatários autorizados.

Tokens QR são aleatórios de 256 bits e contêm zero dados pessoais. Banco guarda somente hash. Emissão/regeneração serializa por convidado, revoga o anterior e exige CONFIRMED. Check-in valida estado atual/hash no servidor e aplica unicidade por evento/pessoa. Snapshot offline é a autorização da última sincronização; mudanças/removal de papel offline não podem ser conhecidas até reconexão.

## Dados e dispositivos

Contatos são opcionais; e-mail/WhatsApp/push precisam consentimentos independentes, revogáveis. Auditoria registra entidade/ação/actor sem conteúdo de conversa ou contato. Providers recebem apenas dados necessários à entrega autorizada. URLs externas passam por validação HTTPS sem usuário/senha, sem execução de conteúdo do banco. Presente não processa pagamento.

Auth usa SecureStore no nativo; caches, ingressos e fila usam AsyncStorage e origin storage web. Esses caches não estão cifrados pela aplicação: use aparelhos bloqueados, saia após uso e planeje driver criptografado/expiração conforme política final. Não compartilhe origem com scripts não confiáveis; configure CSP adaptada ao export, HTTPS e headers de segurança no hosting. Não publique uma configuração com demo; release bloqueia demo por `__DEV__`.

Antes do lançamento, definir controlador/contato de privacidade, base legal, retenção e exclusão de mensagens/contatos/cache, subprocessadores, política pública e processo de correção/exclusão. Revogação de consentimento é funcional; solicitação de exclusão está na conversa com noivos, não é uma exclusão automática do Auth/banco. Não há dados reais em seeds/testes.

## Revisão antes de deploy

Execute lint, typecheck, testes de domínio, banco, navegador, Edge Functions e export. Revise mudanças em RLS/SQL com testes adversariais. Faça busca por service_role, private_key, access_token, password e secret: nomes/configuração/harness não são credenciais, mas qualquer valor real impede publicação. Teste Auth/SMTP, gateway, URLs universais, scheduler, consentimentos e providers num projeto de homologação. Não conceda o secret do worker a usuários finais.

## Dependências auditadas em 09/10/2026

O SDK estável `expo@57.0.27` foi mantido; o SDK 58 está no canal next. O override restrito de xcode para uuid 11.1.1 corrige o advisory de UUID e mantém a chamada v4 CommonJS; a geração de UUID do Xcode foi validada. Query-string permanece na versão compatível fornecida pelo Expo Router: seu substituto ESM não oferece a interface CommonJS exigida pelo SDK atual. Não se altera a implementação interna dos pacotes.

O entrypoint remove queries web não utilizadas antes de inicializar o Router. `+native-intent` aceita somente caminhos conhecidos/códigos válidos, limita o tamanho e remove queries recebidas pelo sistema. Login usa senha. Somente na rota recuperar-senha se aceitam token_hash limitado + type=recovery via verifyOtp ou sessão implícita no fragmento com type=recovery via Auth setSession. Ambos são capturados temporariamente em memória e removidos antes do Router/rede; seus tokens não são logados ou persistidos pela aplicação fora do Auth. Queries arbitrárias continuam rejeitadas. Essas medidas reduzem exposição do decoder legado, mas não declaram a dependência corrigida.

`npm audit --omit=dev --audit-level=high` ainda retorna **21 alertas: 18 high e 3 moderate**. As duas causas high de tooling Expo são **braces 3.0.3** ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)) e **node-forge 1.4.0** ([GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)); o registro não oferece releases corrigidos dessas causas. Os moderate vêm da cadeia query-string/decode-uri-component ([GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)); a versão corrigida usa ESM e requer atualização compatível do Router/SDK. A sugestão automática é downgrade incompatível para Expo 44 ou atualização para Router 58 e não foi aplicada.

Não processar padrões profundamente aninhados ou certificados não confiáveis com esse tooling. Revisar os advisories e atualizar para releases compatíveis corrigidos antes de distribuir; **o audit não passou**. Os checks de implementação são independentes desse resultado, e o ambiente serve ao desenvolvimento, não constitui autorização de lançamento em produção.
