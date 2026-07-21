import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const submitSchema = z.object({
  clientCode: z.string().regex(/^BN-\d{3}-[A-Za-z0-9&@#$%^*()_+\-=\[\]{}|;':",./<>?`~!]+$/),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  subject: z.string().min(1).max(500),
  category: z.string().min(1).max(200),
  message: z.string().min(1).max(10000),
  attachments: z
    .array(
      z.object({
        name: z.string().max(500),
        type: z.string().max(200),
        base64: z.string(), // raw base64, no data: prefix
        size: z.number().int().min(0),
      }),
    )
    .max(10)
    .default([]),
});

export type SubmitFeedbackInput = z.infer<typeof submitSchema>;

export const submitFeedback = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const notion = await import("@/lib/notion.server");

    // 1. Upload files to Supabase Storage (source of truth for admin)
    const storagePaths: string[] = [];
    const uploaded: { name: string; type: string; bytes: Uint8Array }[] = [];
    for (const att of data.attachments) {
      if (att.size > 6 * 1024 * 1024) {
        throw new Error(`Arquivo "${att.name}" excede 6MB`);
      }
      const bytes = Uint8Array.from(atob(att.base64), (c) => c.charCodeAt(0));
      const ext = att.name.includes(".") ? att.name.split(".").pop() : "bin";
      const path = `${data.clientCode}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from("feedback-files")
        .upload(path, bytes, { contentType: att.type || "application/octet-stream" });
      if (upErr) throw new Error(`Falha no upload: ${upErr.message}`);
      storagePaths.push(path);
      uploaded.push({ name: att.name, type: att.type, bytes });
    }

    // 2. Insert feedback row
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("feedback")
      .insert({
        client_code: data.clientCode,
        name: data.name,
        email: data.email,
        type: "feedback",
        subject: data.subject,
        category: data.category,
        message: data.message,
        file_urls: storagePaths,
        notion_status: "pending",
      })
      .select("id")
      .single();
    if (insertErr) throw new Error(`Erro ao salvar: ${insertErr.message}`);
    const feedbackId = inserted.id as string;

    // 3. Sync to Notion (never blocks the user response failure-wise: we
    //    catch and record error in the feedback row so admin panel can retry).
    try {
      const result = await syncFeedbackToNotionInternal(feedbackId, {
        clientCode: data.clientCode,
        subject: data.subject,
        category: data.category,
        message: data.message,
        name: data.name,
        email: data.email,
        uploaded,
      });
      return { ok: true, feedbackId, notionTaskUrl: result.taskUrl };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("feedback")
        .update({ notion_status: "error", notion_error: msg })
        .eq("id", feedbackId);
      // Return ok=true anyway; UI still navigates to thank-you but reports issue
      return { ok: true, feedbackId, notionError: msg };
    }
  });

async function syncFeedbackToNotionInternal(
  feedbackId: string,
  input: {
    clientCode: string;
    subject: string;
    category: string;
    message: string;
    name: string;
    email: string;
    uploaded: { name: string; type: string; bytes: Uint8Array }[];
  },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const notion = await import("@/lib/notion.server");

  const client = await notion.findClientByCode(input.clientCode);
  if (!client) {
    await supabaseAdmin
      .from("feedback")
      .update({
        notion_status: "no_client",
        notion_error: `Cliente não encontrado no Notion para código ${input.clientCode}`,
      })
      .eq("id", feedbackId);
    throw new Error(`Cliente não encontrado no Notion para código ${input.clientCode}`);
  }

  const project = await notion.findActiveProjectForClient(client);

  const sigla =
    client.properties["Sigla"]?.formula?.string ??
    input.clientCode.split("-").slice(-1)[0] ??
    "";

  // Upload attachments to Notion
  const notionAttachments: { name: string; type: string; uploadId: string }[] = [];
  for (const f of input.uploaded) {
    const id = await notion.uploadFileToNotion(f);
    notionAttachments.push({ name: f.name, type: f.type, uploadId: id });
  }

  const title = `[${sigla}] ${input.subject} | ${input.category}`;

  const page = await notion.createTaskInNotion({
    title,
    descricao: input.message,
    categoria: input.category,
    tipoFeedback: "feedback",
    clientCode: input.clientCode,
    requesterName: input.name,
    requesterEmail: input.email,
    sigla,
    projectPageId: project?.id ?? null,
    attachments: notionAttachments,
  });

  const status = project ? "sent" : "no_project";
  await supabaseAdmin
    .from("feedback")
    .update({
      notion_status: status,
      notion_error: project ? null : "Nenhum projeto ativo encontrado para o cliente",
      notion_synced_at: new Date().toISOString(),
      notion_task_id: page.id,
      notion_task_url: page.url,
      tarefa_id: page.id,
    })
    .eq("id", feedbackId);

  return { taskUrl: page.url, taskId: page.id, projectPageId: project?.id ?? null };
}

// ============ Admin functions =================

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const listSchema = z.object({
  search: z.string().optional().default(""),
  categories: z.array(z.string()).optional().default([]),
  clientCode: z.string().optional().default(""),
  notionStatus: z
    .array(z.enum(["pending", "sent", "error", "no_project", "no_client"]))
    .optional()
    .default([]),
  from: z.string().optional().default(""),
  to: z.string().optional().default(""),
  hasAttachments: z.enum(["any", "yes", "no"]).optional().default("any"),
  sort: z.enum(["created_desc", "created_asc", "name_asc"]).optional().default("created_desc"),
  page: z.number().int().min(0).optional().default(0),
  pageSize: z.number().int().min(1).max(100).optional().default(25),
});

export const listFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;

    let q = supabase
      .from("feedback")
      .select(
        "id, created_at, client_code, name, email, subject, category, message, file_urls, notion_status, notion_error, notion_synced_at, notion_task_id, notion_task_url",
        { count: "exact" },
      );

    if (data.search) {
      const s = data.search.replace(/[%,()]/g, " ");
      q = q.or(
        `name.ilike.%${s}%,email.ilike.%${s}%,subject.ilike.%${s}%,message.ilike.%${s}%,client_code.ilike.%${s}%`,
      );
    }
    if (data.categories.length) q = q.in("category", data.categories);
    if (data.clientCode) q = q.eq("client_code", data.clientCode);
    if (data.notionStatus.length) q = q.in("notion_status", data.notionStatus);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.hasAttachments === "yes")
      q = q.not("file_urls", "eq", "{}" as unknown as string[]);
    if (data.hasAttachments === "no")
      q = q.filter("file_urls", "eq", "{}");

    if (data.sort === "created_asc") q = q.order("created_at", { ascending: true });
    else if (data.sort === "name_asc") q = q.order("name", { ascending: true });
    else q = q.order("created_at", { ascending: false });

    const from = data.page * data.pageSize;
    const to = from + data.pageSize - 1;
    q = q.range(from, to);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    // Distinct client codes and categories for filter chips
    const { data: distinctRows } = await supabase
      .from("feedback")
      .select("client_code, category")
      .limit(2000);
    const clientCodes = Array.from(
      new Set((distinctRows ?? []).map((r: any) => r.client_code)),
    ).sort();
    const categoriesAll = Array.from(
      new Set((distinctRows ?? []).map((r: any) => r.category)),
    ).sort();

    return { rows: rows ?? [], count: count ?? 0, clientCodes, categoriesAll };
  });

export const getFeedbackFileUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ paths: z.array(z.string()).max(50) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const out: { path: string; url: string | null }[] = [];
    for (const p of data.paths) {
      const { data: signed } = await supabaseAdmin.storage
        .from("feedback-files")
        .createSignedUrl(p, 3600);
      out.push({ path: p, url: signed?.signedUrl ?? null });
    }
    return { urls: out };
  });

export const retryNotionSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("feedback")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    // Re-download stored files
    const uploaded: { name: string; type: string; bytes: Uint8Array }[] = [];
    for (const p of row.file_urls as string[]) {
      const { data: blob, error: dErr } = await supabaseAdmin.storage
        .from("feedback-files")
        .download(p);
      if (dErr || !blob) continue;
      const buf = new Uint8Array(await blob.arrayBuffer());
      uploaded.push({
        name: p.split("/").pop() ?? p,
        type: blob.type || "application/octet-stream",
        bytes: buf,
      });
    }

    try {
      const result = await syncFeedbackToNotionInternal(row.id, {
        clientCode: row.client_code,
        subject: row.subject,
        category: row.category,
        message: row.message,
        name: row.name,
        email: row.email,
        uploaded,
      });
      return { ok: true, taskUrl: result.taskUrl };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("feedback")
        .update({ notion_status: "error", notion_error: msg })
        .eq("id", row.id);
      return { ok: false, error: msg };
    }
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: !!data, userId: context.userId };
  });
