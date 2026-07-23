import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  requesterName?: string;
  requesterEmail?: string;
  clientCode?: string;
  category?: string;
  subject?: string;
  message?: string;
  notionUrl?: string | null;
  notionStatus?: string;
  hasAttachments?: boolean;
}

const Email = ({
  requesterName,
  requesterEmail,
  clientCode,
  category,
  subject,
  message,
  notionUrl,
  notionStatus,
  hasAttachments,
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>
      Nova solicitação {clientCode ? `de ${clientCode}` : ""} — {subject || ""}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Nova solicitação recebida</Heading>
        <Text style={text}>
          Uma nova solicitação foi enviada pelo formulário de feedback.
        </Text>

        <Section style={box}>
          <Text style={label}>Cliente</Text>
          <Text style={value}>{clientCode || "-"}</Text>
          <Hr style={hr} />
          <Text style={label}>Solicitante</Text>
          <Text style={value}>
            {requesterName || "-"} &lt;{requesterEmail || "-"}&gt;
          </Text>
          <Hr style={hr} />
          <Text style={label}>Tipo</Text>
          <Text style={value}>{category || "-"}</Text>
          <Hr style={hr} />
          <Text style={label}>Assunto</Text>
          <Text style={value}>{subject || "-"}</Text>
          <Hr style={hr} />
          <Text style={label}>Mensagem</Text>
          <Text style={{ ...value, whiteSpace: "pre-wrap" }}>
            {message || "-"}
          </Text>
          {hasAttachments ? (
            <>
              <Hr style={hr} />
              <Text style={label}>Anexos</Text>
              <Text style={value}>Sim — disponíveis na tarefa do Notion e no painel admin.</Text>
            </>
          ) : null}
        </Section>

        {notionUrl ? (
          <Section style={{ textAlign: "center", margin: "8px 0 20px" }}>
            <Button href={notionUrl} style={button}>
              Abrir tarefa no Notion
            </Button>
          </Section>
        ) : (
          <Text style={warn}>
            Tarefa não foi criada automaticamente no Notion (status: {notionStatus || "erro"}). Verifique o painel administrativo.
          </Text>
        )}
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `[Feedback ${d.clientCode || ""}] ${d.subject || "Nova solicitação"}`,
  displayName: "Notificação interna (nova solicitação)",
  previewData: {
    requesterName: "Maria",
    requesterEmail: "maria@cliente.com",
    clientCode: "BN-001-ACME",
    category: "Bug",
    subject: "Ajuste no site",
    message: "Encontrei um erro ao clicar no botão X.",
    notionUrl: "https://www.notion.so/exemplo",
    notionStatus: "sent",
    hasAttachments: true,
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Inter, Arial, sans-serif", color: "#232222" };
const container = { padding: "32px 28px", maxWidth: "620px", margin: "0 auto" };
const h1 = { fontFamily: "'Space Grotesk', Inter, sans-serif", fontSize: "22px", color: "#8c4a32", margin: "0 0 12px" };
const text = { fontSize: "14px", lineHeight: "22px", margin: "0 0 16px" };
const box = { backgroundColor: "#f7f1ea", border: "1px solid #BFAC9B", borderRadius: "10px", padding: "18px 20px", margin: "8px 0 20px" };
const label = { fontSize: "11px", textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#8c4a32", margin: "0 0 4px", fontWeight: 600 };
const value = { fontSize: "14px", margin: "0 0 4px", color: "#232222" };
const hr = { border: "none", borderTop: "1px solid #BFAC9B", margin: "12px 0" };
const button = { backgroundColor: "#8c4a32", color: "#ffffff", padding: "12px 22px", borderRadius: "8px", textDecoration: "none", fontWeight: 600, fontSize: "14px" };
const warn = { fontSize: "13px", color: "#8c4a32", backgroundColor: "#fff4ec", border: "1px solid #BFAC9B", padding: "10px 14px", borderRadius: "8px" };
