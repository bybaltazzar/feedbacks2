import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/debug-notion')({
  server: {
    handlers: {
      GET: async () => {
        const notion = await import('@/lib/notion.server')
        const res = await fetch(`https://api.notion.com/v1/databases/${notion.NOTION_DB.TASKS}`, {
          headers: {
            Authorization: `Bearer ${process.env['NOTION_TOKEN']}`,
            'Notion-Version': '2022-06-28',
          },
        })
        const json: any = await res.json()
        const out: Record<string, any> = {}
        for (const [k, v] of Object.entries<any>(json.properties ?? {})) {
          out[k] = ['select', 'status', 'multi_select'].includes(v.type)
            ? { type: v.type, options: (v[v.type]?.options ?? []).map((o: any) => o.name) }
            : { type: v.type }
        }
        return new Response(JSON.stringify({ ok: res.ok, props: out }, null, 1), {
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  },
})
