/**
 * Notion API helper (server-only).
 * Uses the workspace integration token stored as NOTION_TOKEN.
 */

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const NOTION_VERSION_UPLOADS = "2025-09-03";

export const NOTION_DB = {
  TASKS: "1ea07e3509734b9d8a17610dc97b0cdb",
  PROJECTS: "6732a328f1d340a4bfb891de2cc13dfe",
  CLIENTS: "d79c2a9e9c234329b300081f5697d115",
} as const;

function token() {
  const t = process.env.NOTION_TOKEN;
  if (!t) throw new Error("Missing NOTION_TOKEN");
  return t;
}

async function notionFetch(path: string, init?: RequestInit, version = NOTION_VERSION) {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Notion-Version": version,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion ${path} failed [${res.status}]: ${body}`);
  }
  return res.json();
}

interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, any>;
}

/**
 * Find a client page by its formula-computed CodigoCliente (BN-XXX-SIGLA).
 */
export async function findClientByCode(code: string): Promise<NotionPage | null> {
  const data = await notionFetch(`/databases/${NOTION_DB.CLIENTS}/query`, {
    method: "POST",
    body: JSON.stringify({
      filter: { property: "CodigoCliente", formula: { string: { equals: code } } },
      page_size: 1,
    }),
  });
  return data.results?.[0] ?? null;
}

const ACTIVE_ETAPAS = [
  "Ativo",
  "Contínuo",
  "Desenvolvimento",
  "Implementação",
  "Validação",
  "Acompanhamento",
  "Diagnóstico",
  "Planejamento",
];

/**
 * Find the active project for the given client.
 * Rule:
 *  - Client Serviço = "Assessoria" → prefer Tipo=Growth
 *  - Otherwise → any active project.
 */
export async function findActiveProjectForClient(
  client: NotionPage,
): Promise<NotionPage | null> {
  const servico = client.properties["Serviço"]?.select?.name ?? null;
  const isAssessoria = servico?.toLowerCase() === "assessoria";
  const clientRelation = client.id;

  const baseFilter: any = {
    and: [
      { property: "Cliente", relation: { contains: clientRelation } },
      {
        or: ACTIVE_ETAPAS.map((name) => ({
          property: "Etapa",
          status: { equals: name },
        })),
      },
    ],
  };

  if (isAssessoria) {
    const growthFirst = await notionFetch(`/databases/${NOTION_DB.PROJECTS}/query`, {
      method: "POST",
      body: JSON.stringify({
        filter: {
          and: [...baseFilter.and, { property: "Tipo", select: { equals: "Growth" } }],
        },
        page_size: 1,
      }),
    });
    if (growthFirst.results?.[0]) return growthFirst.results[0];
  }

  const anyActive = await notionFetch(`/databases/${NOTION_DB.PROJECTS}/query`, {
    method: "POST",
    body: JSON.stringify({ filter: baseFilter, page_size: 1 }),
  });
  return anyActive.results?.[0] ?? null;
}

/**
 * Upload a file to Notion's native file storage (single-part, ≤ 20MB).
 * Returns the file_upload id to attach in blocks/properties.
 */
export async function uploadFileToNotion(
  file: { name: string; type: string; bytes: Uint8Array },
): Promise<string> {
  // 1. Create upload slot
  const created = await notionFetch(
    `/file_uploads`,
    {
      method: "POST",
      body: JSON.stringify({
        mode: "single_part",
        filename: file.name,
        content_type: file.type || "application/octet-stream",
      }),
    },
    NOTION_VERSION_UPLOADS,
  );
  const uploadUrl: string = created.upload_url;
  const uploadId: string = created.id;

  // 2. Upload bytes via multipart
  const form = new FormData();
  form.append(
    "file",
    new Blob([file.bytes as BlobPart], { type: file.type || "application/octet-stream" }),
    file.name,
  );

  const sendRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Notion-Version": NOTION_VERSION_UPLOADS,
    },
    body: form,
  });
  if (!sendRes.ok) {
    const body = await sendRes.text();
    throw new Error(`Notion file upload PUT failed [${sendRes.status}]: ${body}`);
  }
  return uploadId;
}

interface CreateTaskInput {
  title: string;
  descricao: string;
  categoria: string;
  tipoFeedback: string;
  clientCode: string;
  requesterName: string;
  requesterEmail: string;
  sigla: string;
  projectPageId: string | null;
  attachments: { name: string; type: string; uploadId: string }[];
}

function isImageMime(m: string) {
  return m.startsWith("image/");
}
function isVideoMime(m: string) {
  return m.startsWith("video/");
}

const RT_LIMIT = 1900; // safe under Notion's 2000-char rich_text limit

function chunkText(s: string, size = RT_LIMIT): string[] {
  if (!s) return [""];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

function paragraphBlocks(text: string) {
  return chunkText(text).map((chunk) => ({
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: chunk } }],
    },
  }));
}

export const TIPO_DEMANDA_OPTIONS = [
  "Interface",
  "Lógica de Automação",
  "Banco de Dados",
  "Performance",
  "Comunicação",
  "Nova Automação",
  "Bug / Erro",
  "Dificuldade de Uso",
  "Alteração de Recurso já criado",
  "Nova solicitação",
] as const;

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Maps a form category to a valid "Tipo de Demanda" option (multi_select). */
export function resolveTipoDemanda(categoria: string): string {
  const target = normalize(categoria);
  const match = TIPO_DEMANDA_OPTIONS.find((o) => normalize(o) === target);
  return match ?? "Nova solicitação";
}

export async function createTaskInNotion(input: CreateTaskInput): Promise<NotionPage> {
  const properties: Record<string, any> = {
    Tarefa: {
      title: [{ type: "text", text: { content: input.title.slice(0, 2000) } }],
    },
    Descrição: {
      rich_text: [{ type: "text", text: { content: input.descricao.slice(0, 1900) } }],
    },
    "Email Solicitante": { email: input.requesterEmail },
    Status: { status: { name: "Backlog" } },
    "Tipo de Demanda": {
      multi_select: [{ name: resolveTipoDemanda(input.categoria) }],
    },
  };

  if (input.projectPageId) {
    properties["Projeto"] = { relation: [{ id: input.projectPageId }] };
  }
  // attachments as native files in the Print/Screenshot / Vídeo property
  if (input.attachments.length > 0) {
    properties["Print/Screenshot / Vídeo"] = {
      files: input.attachments.map((a) => ({
        name: a.name,
        type: "file_upload",
        file_upload: { id: a.uploadId },
      })),
    };
  }

  // Body: descrição (chunked) + metadados + anexos como blocos ricos
  const children: any[] = [
    {
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: [{ type: "text", text: { content: "Solicitação" } }] },
    },
    ...paragraphBlocks(input.descricao),
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          { type: "text", text: { content: "Solicitante: " }, annotations: { bold: true } },
          { type: "text", text: { content: `${input.requesterName} <${input.requesterEmail}>` } },
        ],
      },
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          { type: "text", text: { content: "Cliente: " }, annotations: { bold: true } },
          { type: "text", text: { content: input.clientCode } },
        ],
      },
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          { type: "text", text: { content: "Categoria: " }, annotations: { bold: true } },
          { type: "text", text: { content: input.categoria } },
        ],
      },
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [
          { type: "text", text: { content: "Tipo de feedback: " }, annotations: { bold: true } },
          { type: "text", text: { content: input.tipoFeedback } },
        ],
      },
    },
  ];

  if (input.attachments.length > 0) {
    children.push({
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: [{ type: "text", text: { content: "Anexos" } }] },
    });
    for (const a of input.attachments) {
      if (isImageMime(a.type)) {
        children.push({
          object: "block",
          type: "image",
          image: { type: "file_upload", file_upload: { id: a.uploadId } },
        });
      } else if (isVideoMime(a.type)) {
        children.push({
          object: "block",
          type: "video",
          video: { type: "file_upload", file_upload: { id: a.uploadId } },
        });
      } else {
        children.push({
          object: "block",
          type: "file",
          file: {
            type: "file_upload",
            file_upload: { id: a.uploadId },
            caption: [{ type: "text", text: { content: a.name } }],
          },
        });
      }
    }
  }

  const page = await notionFetch(`/pages`, {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: NOTION_DB.TASKS },
      properties,
      children,
    }),
  });
  return page;
}
