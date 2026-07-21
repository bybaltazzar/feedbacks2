import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";
import {
  ArrowUpRight,
  Download,
  ExternalLink,
  Filter,
  LogOut,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  checkIsAdmin,
  getFeedbackFileUrls,
  listFeedback,
  retryNotionSync,
} from "@/lib/feedback.functions";
import { claimFirstAdmin } from "@/lib/admin-bootstrap.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-yellow-100 text-yellow-800" },
  sent: { label: "Enviado", className: "bg-green-100 text-green-800" },
  error: { label: "Erro", className: "bg-red-100 text-red-800" },
  no_project: { label: "Sem projeto", className: "bg-orange-100 text-orange-800" },
  no_client: { label: "Cliente não localizado", className: "bg-red-100 text-red-800" },
};

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const check = useServerFn(checkIsAdmin);
  const claim = useServerFn(claimFirstAdmin);
  const list = useServerFn(listFeedback);
  const retry = useServerFn(retryNotionSync);
  const getUrls = useServerFn(getFeedbackFileUrls);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hasAttachments, setHasAttachments] = useState<"any" | "yes" | "no">("any");
  const [sort, setSort] = useState<"created_desc" | "created_asc" | "name_asc">(
    "created_desc",
  );
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debounced, clientCode, statusFilter, categoryFilter, from, to, hasAttachments, sort]);

  const adminQuery = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const res = await check();
      if (!res.isAdmin) {
        // try to claim if there's no admin yet
        const claimed = await claim();
        if (claimed.claimed) return { isAdmin: true, userId: res.userId };
      }
      return res;
    },
  });

  const feedbackQuery = useQuery({
    enabled: adminQuery.data?.isAdmin === true,
    queryKey: [
      "feedback",
      { debounced, clientCode, statusFilter, categoryFilter, from, to, hasAttachments, sort, page },
    ],
    queryFn: () =>
      list({
        data: {
          search: debounced,
          clientCode,
          notionStatus: statusFilter as any,
          categories: categoryFilter,
          from: from ? new Date(from).toISOString() : "",
          to: to ? new Date(to + "T23:59:59").toISOString() : "",
          hasAttachments,
          sort,
          page,
          pageSize,
        },
      }),
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: (res) => {
      if (res.ok) toast.success("Sincronizado com o Notion");
      else toast.error("Falha: " + res.error);
      qc.invalidateQueries({ queryKey: ["feedback"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const rows = feedbackQuery.data?.rows ?? [];
  const total = feedbackQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (adminQuery.isLoading) {
    return <div className="p-10 text-muted-foreground">Verificando permissões...</div>;
  }
  if (!adminQuery.data?.isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-heading text-foreground">Acesso negado</h1>
        <p className="text-muted-foreground max-w-md">
          Sua conta não possui permissão de administrador. Solicite a um administrador
          para promover seu usuário.
        </p>
        <button
          onClick={signOut}
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
        >
          Sair
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" />
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-heading font-semibold text-foreground">
              Painel · Solicitações
            </h1>
            <p className="text-xs text-muted-foreground">
              {total} registro{total === 1 ? "" : "s"}
            </p>
          </div>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-4">
        {/* Filters */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, e-mail, assunto, mensagem, código..."
                className="w-full rounded-md border border-input pl-9 pr-3 py-2 text-sm bg-background"
              />
            </div>
            <select
              value={clientCode}
              onChange={(e) => setClientCode(e.target.value)}
              className="rounded-md border border-input px-3 py-2 text-sm bg-background"
            >
              <option value="">Todos os clientes</option>
              {(feedbackQuery.data?.clientCodes ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="rounded-md border border-input px-3 py-2 text-sm bg-background"
            >
              <option value="created_desc">Mais recentes</option>
              <option value="created_asc">Mais antigos</option>
              <option value="name_asc">Nome (A-Z)</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">De</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-md border border-input px-2 py-1.5 text-sm bg-background"
              />
              <label className="text-xs text-muted-foreground">até</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-md border border-input px-2 py-1.5 text-sm bg-background"
              />
            </div>

            <select
              value={hasAttachments}
              onChange={(e) => setHasAttachments(e.target.value as any)}
              className="rounded-md border border-input px-3 py-1.5 text-sm bg-background"
            >
              <option value="any">Anexos: qualquer</option>
              <option value="yes">Com anexos</option>
              <option value="no">Sem anexos</option>
            </select>

            {(search ||
              clientCode ||
              statusFilter.length ||
              categoryFilter.length ||
              from ||
              to ||
              hasAttachments !== "any") && (
              <button
                onClick={() => {
                  setSearch("");
                  setClientCode("");
                  setStatusFilter([]);
                  setCategoryFilter([]);
                  setFrom("");
                  setTo("");
                  setHasAttachments("any");
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> Limpar
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Filter className="h-3 w-3" /> Status Notion:
            </span>
            {Object.entries(STATUS_LABELS).map(([k, v]) => {
              const active = statusFilter.includes(k);
              return (
                <button
                  key={k}
                  onClick={() =>
                    setStatusFilter((s) =>
                      s.includes(k) ? s.filter((x) => x !== k) : [...s, k],
                    )
                  }
                  className={`px-2 py-0.5 rounded text-xs border ${
                    active
                      ? v.className + " border-transparent"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v.label}
                </button>
              );
            })}
          </div>

          {(feedbackQuery.data?.categoriesAll ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">Categoria:</span>
              {(feedbackQuery.data?.categoriesAll ?? []).map((c) => {
                const active = categoryFilter.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() =>
                      setCategoryFilter((s) =>
                        s.includes(c) ? s.filter((x) => x !== c) : [...s, c],
                      )
                    }
                    className={`px-2 py-0.5 rounded text-xs border ${
                      active
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {feedbackQuery.isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Nenhum registro encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">Data</th>
                    <th className="px-4 py-2 font-medium">Cliente</th>
                    <th className="px-4 py-2 font-medium">Solicitante</th>
                    <th className="px-4 py-2 font-medium">Assunto</th>
                    <th className="px-4 py-2 font-medium">Categoria</th>
                    <th className="px-4 py-2 font-medium">Notion</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => {
                    const st = STATUS_LABELS[r.notion_status] ?? {
                      label: r.notion_status,
                      className: "bg-gray-100 text-gray-800",
                    };
                    return (
                      <>
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                            {new Date(r.created_at).toLocaleString("pt-BR")}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs">{r.client_code}</td>
                          <td className="px-4 py-2">
                            <div className="font-medium">{r.name}</div>
                            <div className="text-xs text-muted-foreground">{r.email}</div>
                          </td>
                          <td className="px-4 py-2 max-w-xs truncate">{r.subject}</td>
                          <td className="px-4 py-2">{r.category}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs ${st.className}`}
                            >
                              {st.label}
                            </span>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  setExpanded((e) => (e === r.id ? null : r.id))
                                }
                                className="text-xs text-primary hover:underline"
                              >
                                {expanded === r.id ? "Fechar" : "Detalhes"}
                              </button>
                              {r.notion_task_url && (
                                <a
                                  href={r.notion_task_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                                >
                                  Notion <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                              {(r.notion_status === "error" ||
                                r.notion_status === "no_client" ||
                                r.notion_status === "no_project" ||
                                r.notion_status === "pending") && (
                                <button
                                  onClick={() => retryMut.mutate(r.id)}
                                  disabled={retryMut.isPending}
                                  className="text-xs inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
                                >
                                  <RefreshCcw className="h-3 w-3" /> Retentar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expanded === r.id && (
                          <tr key={r.id + "-d"} className="bg-muted/30 border-t border-border">
                            <td colSpan={7} className="px-4 py-4 space-y-3">
                              <div>
                                <div className="text-xs uppercase text-muted-foreground">
                                  Mensagem
                                </div>
                                <div className="mt-1 whitespace-pre-wrap text-sm">
                                  {r.message}
                                </div>
                              </div>
                              {r.notion_error && (
                                <div className="text-sm">
                                  <div className="text-xs uppercase text-red-600">
                                    Erro Notion
                                  </div>
                                  <div className="mt-1 font-mono text-xs bg-red-50 text-red-800 rounded p-2">
                                    {r.notion_error}
                                  </div>
                                </div>
                              )}
                              {(r.file_urls?.length ?? 0) > 0 && (
                                <AttachmentsBlock
                                  paths={r.file_urls}
                                  getUrls={getUrls}
                                />
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            Página {page + 1} de {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function AttachmentsBlock({
  paths,
  getUrls,
}: {
  paths: string[];
  getUrls: (opts: { data: { paths: string[] } }) => Promise<{
    urls: { path: string; url: string | null }[];
  }>;
}) {
  const q = useQuery({
    queryKey: ["signed-urls", paths],
    queryFn: () => getUrls({ data: { paths } }),
  });
  if (q.isLoading) return <div className="text-xs text-muted-foreground">Carregando anexos...</div>;
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground mb-2">Anexos</div>
      <div className="flex flex-wrap gap-2">
        {(q.data?.urls ?? []).map((u) => (
          <a
            key={u.path}
            href={u.url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
          >
            <Download className="h-3 w-3" />
            {u.path.split("/").pop()}
          </a>
        ))}
      </div>
    </div>
  );
}
