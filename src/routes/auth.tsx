import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") navigate({ to: "/admin" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const signIn = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth",
        extraParams: {
          hd: "baltazzar.com.br",
          prompt: "select_account",
        },
      });
      if (result.error) {
        toast.error("Falha ao entrar: " + result.error.message);
        setLoading(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro desconhecido");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Toaster position="top-center" />
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-heading font-semibold text-foreground">
          Painel Administrativo
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Acesso restrito. Entre com sua conta Google BALTAZZAR.
        </p>
        <button
          onClick={signIn}
          disabled={loading}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? "Aguarde..." : "Entrar com Google"}
        </button>
      </div>
    </div>
  );
}
