import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook público de sincronização com o Notion.
 *
 * Preserva a mesma "ideia" da edge function `sync-notion` do projeto original:
 * um endpoint chamado por pg_cron (ou manualmente) que puxa páginas de
 * databases do Notion e faz upsert no banco.
 *
 * Segurança:
 *  - Rota sob `/api/public/*` (bypass de auth do site publicado), mas exige
 *    o cabeçalho `apikey` do projeto (padrão Cloud/pg_cron).
 *  - `NOTION_INTEGRATION_TOKEN` deve ser cadastrado como secret antes do uso.
 */

const NOTION_DATABASES = {
  TASKS: "1ea07e3509734b9d8a17610dc97b0cdb",
  PROJECTS: "6732a328f1d340a4bfb891de2cc13dfe",
  CLIENTS: "d79c2a9e9c234329b300081f5697d115",
  USERS: "8f9557a2d5f34959885c60637c5cc6f1",
} as const;

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

async function queryNotionDatabase(token: string, databaseId: string) {
  const res = await fetch(`${NOTION_API}/databases/${databaseId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`Notion ${databaseId} failed [${res.status}]: ${await res.text()}`);
  }
  return (await res.json()) as { results: any[] };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export const Route = createFileRoute("/api/public/hooks/sync-notion")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: corsHeaders() }),

      POST: async ({ request }) => {
        const expectedKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        const providedKey = request.headers.get("apikey");
        if (!expectedKey || providedKey !== expectedKey) {
          return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } },
          );
        }

        const notionToken = process.env.NOTION_INTEGRATION_TOKEN;
        if (!notionToken) {
          return new Response(
            JSON.stringify({
              error:
                "NOTION_INTEGRATION_TOKEN não configurado. Cadastre o secret para ativar a sincronização.",
            }),
            { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders() } },
          );
        }

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const [projects, tasks] = await Promise.all([
            queryNotionDatabase(notionToken, NOTION_DATABASES.PROJECTS),
            queryNotionDatabase(notionToken, NOTION_DATABASES.TASKS),
          ]);

          // As tabelas `projects` e `tasks` ainda não existem neste projeto;
          // criamos o alias `db` para preservar a estrutura do webhook original
          // do Bolt. Basta rodar a migração dessas tabelas para ativar o upsert.
          const db = supabaseAdmin as unknown as {
            from: (table: string) => {
              upsert: (row: Record<string, unknown>) => Promise<unknown>;
            };
          };

          let projectCount = 0;
          for (const page of projects.results) {
            const p = page.properties ?? {};
            await db.from("projects").upsert({
              notion_id: page.id,
              name: p.Name?.title?.[0]?.plain_text ?? null,
              status: p.Status?.status?.name ?? null,
              client_code: p.ClientCode?.rich_text?.[0]?.plain_text ?? null,
              updated_at: new Date().toISOString(),
            });
            projectCount += 1;
          }

          let taskCount = 0;
          for (const page of tasks.results) {
            const p = page.properties ?? {};
            await db.from("tasks").upsert({
              notion_id: page.id,
              title: p.Name?.title?.[0]?.plain_text ?? null,
              status: p.Status?.status?.name ?? null,
              due_date: p.DueDate?.date?.start ?? null,
              project_id: p.Project?.relation?.[0]?.id ?? null,
              updated_at: new Date().toISOString(),
            });
            taskCount += 1;
          }

          return new Response(
            JSON.stringify({
              success: true,
              projects: projectCount,
              tasks: taskCount,
            }),
            { headers: { "Content-Type": "application/json", ...corsHeaders() } },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("sync-notion failed:", message);
          return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } },
          );
        }
      },
    },
  },
});
