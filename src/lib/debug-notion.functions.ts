import { createServerFn } from "@tanstack/react-start";

export const debugTasksSchema = createServerFn({ method: "GET" }).handler(async () => {
  const notion = await import("@/lib/notion.server");
  const res = await fetch(
    `https://api.notion.com/v1/databases/${notion.NOTION_DB.TASKS}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
      },
    },
  );
  const json: any = await res.json();
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries<any>(json.properties ?? {})) {
    out[k] =
      v.type === "select" || v.type === "status" || v.type === "multi_select"
        ? { type: v.type, options: (v[v.type]?.options ?? []).map((o: any) => o.name), groups: (v[v.type]?.groups ?? []).map((g: any) => g.name) }
        : { type: v.type };
  }
  return { ok: res.ok, props: out };
});
