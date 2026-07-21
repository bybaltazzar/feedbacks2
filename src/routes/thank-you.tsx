import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquarePlus } from "lucide-react";
import { BaltazzarFooter } from "@/components/BaltazzarFooter";

export const Route = createFileRoute("/thank-you")({
  head: () => ({
    meta: [
      { title: "Solicitação enviada — BALTAZZAR" },
      {
        name: "description",
        content:
          "Sua solicitação foi registrada com sucesso. Nossa equipe entrará em contato em breve.",
      },
    ],
  }),
  component: ThankYouPage,
});

function ThankYouPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[image:var(--gradient-surface)]">
      <main className="flex-grow container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <img
            src="https://sebastianbaltazar.com.br/wp-content/uploads/Logotipo-horizontal-Cor-secundaria-e1741465318560.png"
            alt="BALTAZZAR"
            className="w-56 mx-auto mb-10"
          />

          <h1 className="text-3xl md:text-4xl font-bold text-terracota mb-4">
            Solicitação Enviada com Sucesso!
          </h1>

          <p className="text-lg text-brand-black/80 mb-10">
            Sua solicitação foi registrada com sucesso. Nossa equipe analisará com
            atenção e, se necessário, entraremos em contato em breve.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/"
              className="inline-flex items-center px-6 py-3 bg-brand-green text-brand-white rounded-xl hover:opacity-90 transition-all"
            >
              <MessageSquarePlus className="mr-2 w-5 h-5" />
              Nova Solicitação
            </Link>
          </div>

          <div className="mt-14 flex flex-wrap justify-center gap-6 text-sm">
            {[
              ["Instagram", "https://www.instagram.com/omagodonotion/"],
              ["YouTube", "https://www.youtube.com/@sebastian.baltazar"],
              ["LinkedIn", "https://www.linkedin.com/in/sebastianbaltazar/"],
              ["Threads", "https://www.threads.net/@omagodonotion"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-terracota hover:opacity-80 font-medium"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </main>
      <BaltazzarFooter />
    </div>
  );
}
