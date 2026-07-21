export function BaltazzarFooter() {
  return (
    <footer className="bg-brand-black text-brand-white py-6 mt-auto">
      <div className="container mx-auto px-4 text-center text-sm">
        <p className="mb-2">© 2025 BALTAZZAR. Todos os direitos reservados.</p>
        <p className="text-brand-white/80">
          <a
            href="https://sebastianbaltazar.com.br/politica-de-privacidade/"
            className="hover:text-areia transition-colors"
            target="_blank"
            rel="noreferrer noopener"
          >
            Política de Privacidade
          </a>
          <span className="mx-2">|</span>
          <a
            href="https://sebastianbaltazar.com.br/termos-de-uso/"
            className="hover:text-areia transition-colors"
            target="_blank"
            rel="noreferrer noopener"
          >
            Termos de Uso
          </a>
        </p>
      </div>
    </footer>
  );
}
