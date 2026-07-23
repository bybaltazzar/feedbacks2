import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AlertCircle, Send, Upload } from "lucide-react";
import { toast, Toaster } from "sonner";
import { BaltazzarFooter } from "@/components/BaltazzarFooter";
import { submitFeedback } from "@/lib/feedback.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Feedbacks — BALTAZZAR" },
      {
        name: "description",
        content:
          "Envie sua solicitação ou feedback para a equipe BALTAZZAR. Selecione o tipo de atendimento e descreva sua necessidade.",
      },
    ],
  }),
  component: FeedbackFormPage,
});

interface UploadProgress {
  name: string;
  size: number;
  progress: number;
  status: "pending" | "uploading" | "completed" | "error";
  error?: string;
}

const MAX_FILE_SIZE = 6 * 1024 * 1024;

const categories = [
  { value: "Interface", label: "Interface" },
  { value: "Lógica de Automação", label: "Lógica de Automação" },
  { value: "Banco de Dados", label: "Banco de Dados" },
  { value: "Performance", label: "Performance" },
  { value: "Comunicação", label: "Comunicação" },
];

function validateClientCode(code: string) {
  return /^BN-\d{3}-[A-Za-z0-9&@#$%^*()_+\-=\[\]{}|;':",./<>?`~!]+$/.test(code);
}

function FeedbackFormPage() {
  const navigate = useNavigate();
  const submit = useServerFn(submitFeedback);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientCodeError, setClientCodeError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [formData, setFormData] = useState({
    clientCode: "",
    name: "",
    email: "",
    subject: "",
    category: "",
    message: "",
    files: [] as File[],
  });

  const handleClientCodeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setFormData((prev) => ({ ...prev, clientCode: value }));
    if (value && !validateClientCode(value)) {
      setClientCodeError("Confirme o código do cliente com o gestor");
    } else {
      setClientCodeError("");
    }
  };

  const validateFiles = (files: File[]) => {
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error("Um ou mais arquivos excedem o limite de 6MB permitido");
        return false;
      }
    }
    return true;
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setFormData((prev) => ({ ...prev, files }));
    setUploadProgress([]);
    validateFiles(files);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (clientCodeError) {
      toast.error("Corrija o código do cliente antes de enviar");
      return;
    }
    if (!validateFiles(formData.files)) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    const loading = toast.loading("Enviando feedback...");

    try {
      // Read file contents into base64 so the server function handles both
      // Storage upload AND Notion upload in one authenticated call.
      const attachments: { name: string; type: string; base64: string; size: number }[] = [];
      if (formData.files.length > 0) {
        setUploadProgress(
          formData.files.map((f) => ({
            name: f.name,
            size: f.size,
            progress: 0,
            status: "uploading" as const,
          })),
        );
        for (let i = 0; i < formData.files.length; i++) {
          const file = formData.files[i];
          const buf = await file.arrayBuffer();
          let bin = "";
          const bytes = new Uint8Array(buf);
          for (let j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]);
          attachments.push({
            name: file.name,
            type: file.type,
            base64: btoa(bin),
            size: file.size,
          });
          setUploadProgress((prev) =>
            prev.map((p, idx) =>
              idx === i ? { ...p, progress: 100, status: "completed" } : p,
            ),
          );
        }
      }

      const selected = categories.find((c) => c.value === formData.category);

      const result = await submit({
        data: {
          clientCode: formData.clientCode,
          name: formData.name,
          email: formData.email,
          subject: formData.subject,
          category: selected?.label ?? formData.category,
          message: formData.message,
          attachments,
        },
      });

      toast.dismiss(loading);
      if (result.notionError) {
        toast.warning(
          "Feedback salvo, mas houve um erro ao criar a tarefa no Notion. O time será notificado.",
        );
      } else {
        toast.success("Feedback enviado com sucesso!");
      }
      navigate({ to: "/thank-you" });
    } catch (error) {
      toast.dismiss(loading);
      toast.error(
        error instanceof Error ? error.message : "Erro ao enviar. Tente novamente.",
      );
      console.error("Feedback submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[image:var(--gradient-surface)]">
      <main className="flex-grow">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <header className="text-center mb-12">
              <img
                src="https://sebastianbaltazar.com.br/wp-content/uploads/Logotipo-horizontal-Cor-secundaria-e1741465318560.png"
                alt="BALTAZZAR"
                className="w-64 mx-auto mb-8"
              />
              <h1 className="text-3xl md:text-4xl font-bold text-brand-black mb-4">
                Sistema de Solicitações
              </h1>
              <p className="text-lg text-brand-black/70 max-w-2xl mx-auto">
                Selecione abaixo o tipo de atendimento baseado no seu contrato.
                Tenha em mãos o seu código único de cliente (peça ao nosso Gestor).
              </p>
            </header>

            <div className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-[var(--shadow-elegant)] border border-areia/30 overflow-hidden">
              <div className="bg-[image:var(--gradient-brand)] p-6">
                <h2 className="text-xl font-semibold text-primary-foreground text-center">
                  Formulário de Feedback
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
                <Field label="Código do Cliente *">
                  <input
                    type="text"
                    placeholder="BN-123-SIGLA"
                    value={formData.clientCode}
                    onChange={handleClientCodeChange}
                    required
                    className={`w-full p-4 border-2 rounded-xl bg-background/60 transition-all focus:outline-none focus:ring-2 focus:ring-terracota/50 ${
                      clientCodeError
                        ? "border-destructive focus:border-destructive"
                        : "border-areia/60 focus:border-terracota"
                    }`}
                  />
                  {clientCodeError && (
                    <div className="flex items-center mt-2 text-destructive">
                      <AlertCircle className="w-4 h-4 mr-2" />
                      <span className="text-sm">{clientCodeError}</span>
                    </div>
                  )}
                  <p className="text-xs text-brand-black/60 mt-1">
                    Formato: BN-XXX-SIGLA (XXX = 3 dígitos, SIGLA = sua identificação)
                  </p>
                </Field>

                <div className="grid md:grid-cols-2 gap-6">
                  <Field label="Nome *">
                    <TextInput
                      value={formData.name}
                      onChange={(v) =>
                        setFormData((prev) => ({ ...prev, name: v }))
                      }
                      required
                    />
                  </Field>
                  <Field label="Email *">
                    <TextInput
                      type="email"
                      value={formData.email}
                      onChange={(v) =>
                        setFormData((prev) => ({ ...prev, email: v }))
                      }
                      required
                    />
                  </Field>
                </div>

                <Field label="Assunto *">
                  <TextInput
                    placeholder="Digite o assunto"
                    value={formData.subject}
                    onChange={(v) =>
                      setFormData((prev) => ({ ...prev, subject: v }))
                    }
                    required
                  />
                </Field>

                <Field label="Categoria *">
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, category: e.target.value }))
                    }
                    required
                    className="w-full p-4 border-2 border-areia/60 rounded-xl bg-background/60 transition-all focus:outline-none focus:ring-2 focus:ring-terracota/50 focus:border-terracota"
                  >
                    <option value="">Selecione...</option>
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Mensagem *">
                  <textarea
                    placeholder="Descreva seu feedback detalhadamente..."
                    value={formData.message}
                    maxLength={10000}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, message: e.target.value.slice(0, 10000) }))
                    }
                    required
                    className="w-full p-4 border-2 border-areia/60 rounded-xl bg-background/60 h-32 resize-none transition-all focus:outline-none focus:ring-2 focus:ring-terracota/50 focus:border-terracota"
                  />
                  <p className="text-xs text-brand-black/60 mt-1 text-right">
                    {formData.message.length.toLocaleString("pt-BR")} / 10.000 caracteres
                  </p>
                </Field>

                <div className="space-y-4">
                  <label className="block text-sm font-semibold text-brand-black">
                    Anexos (opcional)
                  </label>
                  <p className="text-sm text-brand-black/60">
                    Envie prints ou vídeos para exemplificar seu feedback (máx. 6MB cada)
                  </p>

                  <label className="group cursor-pointer block">
                    <div className="w-full flex flex-col items-center px-6 py-8 rounded-xl border-2 border-dashed border-areia hover:border-terracota transition-all bg-background/40 group-hover:bg-terracota/5">
                      <div className="p-3 bg-terracota/10 rounded-full mb-4 group-hover:bg-terracota/20 transition-colors">
                        <Upload className="w-6 h-6 text-terracota" />
                      </div>
                      <span className="text-brand-black font-medium mb-1">
                        Clique para fazer upload
                      </span>
                      <span className="text-sm text-brand-black/60">
                        ou arraste e solte seus arquivos aqui
                      </span>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,video/*"
                      multiple
                      onChange={handleFileChange}
                      ref={fileInputRef}
                    />
                  </label>

                  {formData.files.length > 0 && (
                    <div className="bg-background/60 rounded-xl p-4 border border-areia/40">
                      <p className="text-sm font-semibold text-brand-black mb-3">
                        Arquivos selecionados:
                      </p>
                      <ul className="space-y-2">
                        {formData.files.map((file, index) => (
                          <li
                            key={index}
                            className="flex items-center justify-between text-sm bg-card/80 rounded-lg p-3"
                          >
                            <span className="text-brand-black">{file.name}</span>
                            <span className="text-brand-black/60">
                              {(file.size / 1024 / 1024).toFixed(2)}MB
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {uploadProgress.length > 0 && (
                    <div className="space-y-3">
                      {uploadProgress.map((p, index) => (
                        <div
                          key={index}
                          className="bg-card/80 rounded-xl p-4 border border-areia/40"
                        >
                          <div className="flex justify-between text-sm text-brand-black mb-2">
                            <span className="font-medium">{p.name}</span>
                            <span>
                              {p.status === "completed"
                                ? "100%"
                                : p.status === "error"
                                  ? "Erro"
                                  : `${p.progress}%`}
                            </span>
                          </div>
                          <div className="h-2 bg-areia/30 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 rounded-full ${
                                p.status === "error"
                                  ? "bg-destructive"
                                  : p.status === "completed"
                                    ? "bg-brand-green"
                                    : "bg-terracota"
                              }`}
                              style={{ width: `${p.progress}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting || !!clientCodeError}
                    className="w-full flex items-center justify-center px-8 py-4 bg-[image:var(--gradient-brand)] text-primary-foreground font-semibold rounded-xl shadow-md hover:shadow-[var(--shadow-elegant)] transform hover:scale-[1.01] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    <Send className="mr-3 w-5 h-5" />
                    {isSubmitting ? "Enviando..." : "Enviar Feedback"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>
      <BaltazzarFooter />
      <Toaster position="top-center" richColors />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-brand-black">{label}</label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      className="w-full p-4 border-2 border-areia/60 rounded-xl bg-background/60 transition-all focus:outline-none focus:ring-2 focus:ring-terracota/50 focus:border-terracota"
    />
  );
}
