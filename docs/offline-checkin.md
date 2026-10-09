# Operação offline do cerimonial

1. Faça login autorizado com conexão e abra Check-in/Dia do evento.
2. Toque em Preparar / atualizar cache offline. Verifique a quantidade de confirmados e entre no local com a base atualizada.
3. O snapshot salva nomes, famílias ativas, status confirmado, hashes de QR válidos e entradas conhecidas. Contatos, conversas e restrições alimentares não são enviados ao cerimonial.
4. Sem conexão, escaneie o QR ou busque pelo nome/família. A entrada acessível aceita o conteúdo do QR e valida exatamente como o scanner.
5. O app extrai o token opaco, calcula SHA-256 e procura no cache. Exibe a pessoa antes de registrar. Entrada manual é alternativa para pessoas confirmadas.
6. Confirmar entrada gera UUID de mutação, grava na fila e mostra o registro local. A UI diz “Salvo neste dispositivo. Será sincronizado quando houver conexão.”
7. Ao reconectar, a fila reenvia com o mesmo UUID. PostgreSQL deduplica por mutation_id e evento/convidado. Snapshot atualizado substitui a entrada local e a outbox registra a projeção para Sheets.

Não é possível conhecer entradas feitas por outro celular enquanto ambos estão completamente offline. Revogações/mudanças após o último cache também não são conhecidas offline: sincronize próximo ao início e mantenha procedimento humano para situações divergentes. O servidor revalida confirmação e validade atual do hash ao receber QR; uma revogação retém o item com erro, sem declarar a entrada como sincronizada. Entradas manuais registram método MANUAL, actor e horário do servidor.

O horário canônico de check-in é o de aceitação server-side. O timestamp local é exibido enquanto pendente; não é prova de horário físico. O job de planilha pode concluir depois da entrada e nunca bloqueia a fila principal. Se houver duplicidade entre aparelhos, vale o registro já existente no backend; a UI mostra responsável e horário originais na nova leitura.

AsyncStorage é o driver persistente multiplataforma, isolado por conta/evento. Auth usa SecureStore no nativo e storage de origem no web. Evite aparelhos compartilhados sem bloqueio; dados offline não são cifrados por este driver. Planeje driver criptografado/SQLite e expiração automática de cache conforme política final de retenção antes da distribuição ao público. Sair remove o cache/ingressos da conta; pendências requerem descarte explícito. Tokens do ingresso estão no cache local, nunca no QR hash exportado ao cerimonial.

Web offline depende de primeiro acesso online e de export/hosting com service worker/HTTPS. Expo dev não registra o service worker. Shell estático e cache de dados são separados; APIs Supabase e URLs de convites não são cacheadas pelo worker. No primeiro acesso sem conexão não há como validar um código novo.
