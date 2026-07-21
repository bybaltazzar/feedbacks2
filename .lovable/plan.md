## Objetivo

Substituir o webhook `sync-notion` por escrita **direta** no Notion no momento em que o formulário é enviado, e adicionar um **painel admin** com filtros para consultar todas as respostas.

## 1. Segredo do Notion

O secret `NOTION_TOKEN a ser usado é: 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`

Os IDs das bases já ficam fixos no código (públicos, não são segredo):

- Tarefas: `1ea07e3509734b9d8a17610dc97b0cdb`
- Projetos: `6732a328f1d340a4bfb891de2cc13dfe`
- Clientes: `d79c2a9e9c234329b300081f5697d115`

Depois que o token estiver salvo, vou **ler o schema real das 3 bases** (`GET /v1/databases/{id}`) e mapear os nomes exatos das propriedades (Title, Status, Tipo de cliente, Código, relação Projeto→Cliente, relação Tarefa→Projeto etc.) antes de escrever a lógica de envio. Se algum nome divergir do esperado, ajusto o mapeamento nesse momento.

## 2. Fluxo de envio ao Notion (no submit do formulário)

Trocar `sync-notion` (webhook + pg_cron) por uma **server function** `submitFeedback` que faz, em ordem:

1. Upload dos anexos no bucket `feedback-files` (como já faz hoje).
2. `INSERT` na tabela `feedback` (mantém histórico e é a fonte do painel admin).
3. **Resolver Projeto no Notion**:
  - Buscar cliente na base **Clientes** por `client_code` (`BN-XXX-...`).
  - Ler o campo "Tipo" do cliente.
  - Buscar em **Projetos** o projeto **ativo** relacionado a esse cliente:
    - Se tipo = **ASSESSORIA** → filtrar também por nome/tag contendo **"GROWTH"**.
    - Outros tipos → o projeto ativo existente.
  - Se não encontrar: gravar a tarefa mesmo assim, sem relação de projeto, e marcar `notion_error` no registro do feedback (para aparecer no painel).
4. **Criar Tarefa** na base Tarefas com: título = `subject`, descrição/rich text = `message + categoria + anexos (URLs assinadas)`, relação → Projeto encontrado, campos de origem (código cliente, email, nome).
5. Guardar `tarefa_id` retornado pelo Notion na linha do `feedback` (coluna já existe).

Tudo isso roda no servidor, com o token nunca exposto ao browser. A rota `src/routes/api/public/hooks/sync-notion.ts` e o cron associado saem.

## 3. Painel Admin (`/admin`)

Rota protegida sob `_authenticated/admin`. Requer login — vou habilitar **email/senha + Google** no Lovable Cloud (padrão) e criar tabela `user_roles` + função `has_role` para restringir `/admin` ao papel `admin`. O primeiro admin precisa ser marcado manualmente (te mostro a linha de SQL para rodar).

Listagem de feedbacks com filtros combináveis:

- Busca livre (nome, email, assunto, mensagem, código do cliente).
- Filtro por **categoria** (multi-select).
- Filtro por **código do cliente** (autocomplete a partir dos existentes).
- Filtro por **status de sincronização Notion**: enviado, erro, sem projeto encontrado.
- Filtro por **intervalo de datas** (created_at).
- Filtro **com/sem anexos**.
- Ordenação por data, nome, categoria.
- Paginação server-side.

Detalhe do feedback:

- Todos os campos + preview de anexos (via signed URLs, expira em 1h).
- Link direto para a tarefa criada no Notion (`https://notion.so/{tarefa_id sem hifens}`).
- Botão **"Reenviar para Notion"** para casos com erro.

Ajustes no schema (via migração):

- Adicionar `notion_status` (`pending|sent|error|no_project`), `notion_error`, `notion_synced_at` em `feedback`.
- Índices em `created_at`, `client_code`, `category` para os filtros.
- Política de leitura restrita: `SELECT` em `feedback` apenas para `has_role(auth.uid(),'admin')` (substitui o `authenticated true` atual).

## 4. Ordem de execução

1. `add_secret NOTION_TOKEN` (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).
2. Ler schemas das 3 bases via `standard_connectors--call_gateway_connection`? — **não**: a base é acessada com o token direto, sem connector. Uso `fetch` server-side em uma função utilitária de "inspeção" e te reporto o mapeamento antes de gravar código de negócio, para você conferir.
3. Migração: colunas `notion_status`, `notion_error`, `notion_synced_at`, índices, tabela `user_roles`, função `has_role`, políticas.
4. Habilitar auth email+senha e Google.
5. Implementar `submitFeedback` (server fn) e trocar o handler do formulário.
6. Implementar `/admin` com filtros.
7. Remover rota `sync-notion` e o cron associado.
8. Marcar seu usuário como admin (SQL manual, te passo o comando).

## Pontos para você confirmar antes de eu começar

1. **Auth do admin**: email/senha + Google está OK, ou você quer só email/senha (ou só Google)? Só Google
2. **Título da tarefa no Notion**: uso `subject` do formulário. OK, ou prefere um padrão tipo `[BN-XXX-SIGLA] subject`? [Sigla] Titulo Tarefa | Tipo de Feeback  
3. **Anexos no Notion**: coloco as URLs assinadas (expiração 7 dias, o máximo do Supabase) dentro do corpo da tarefa. OK, ou você quer que eu tente subir os arquivos como "files" nativos do Notion (o Notion API só aceita URL externa — não faz upload direto)? Faz upload como FILE (Pode por no CORPO da pagina de Tarefas) Precisa ficar salvo no ADMIN sempre
4. **Se não achar projeto ativo** para o cliente: criar a tarefa sem projeto e sinalizar no admin (proposta acima), ou **bloquear** o envio e mostrar erro para o usuário do formulário? Enviar, mostrar erro, e deixar erro no painel ADMIN