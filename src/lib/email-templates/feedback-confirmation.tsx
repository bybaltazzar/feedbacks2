import * as React from "react";
import {
  Body,
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
  name?: string;
  subject?: string;
  category?: string;
  clientCode?: string;
}

const Email = ({ name, subject, category, clientCode }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Recebemos sua solicitação — Baltazzar</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Recebemos sua solicitação</Heading>
        <Text style={text}>
          Olá {name || "cliente"}, obrigado por enviar sua solicitação para a
          Baltazzar. Nosso time já foi notificado e dará seguimento em breve.
        </Text>
        <Section style={box}>
          <Text style={label}>Código do cliente</Text>
          <Text style={value}>{clientCode || "-"}</Text>
          <Hr style={hr} />
          <Text style={label}>Tipo</Text>
          <Text style={value}>{category || "-"}</Text>
          <Hr style={hr} />
          <Text style={label}>Assunto</Text>
          <Text style={value}>{subject || "-"}</Text>
        </Section>
        <Text style={muted}>
          Este é um e-mail automático de confirmação. Caso precise complementar
          a solicitação, basta responder a esta mensagem.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `Recebemos sua solicitação${d.subject ? ` — ${d.subject}` : ""}`,
  displayName: "Confirmação para o solicitante",
  previewData: {
    name: "Maria",
    subject: "Ajuste no site",
    category: "Bug",
    clientCode: "BN-001-ACME",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Inter, Arial, sans-serif", color: "#232222" };
const container = { padding: "32px 28px", maxWidth: "560px", margin: "0 auto" };
const h1 = { fontFamily: "'Space Grotesk', Inter, sans-serif", fontSize: "24px", color: "#8c4a32", margin: "0 0 16px" };
const text = { fontSize: "15px", lineHeight: "22px", margin: "0 0 20px" };
const box = { backgroundColor: "#f7f1ea", border: "1px solid #BFAC9B", borderRadius: "10px", padding: "18px 20px", margin: "12px 0 24px" };
const label = { fontSize: "12px", textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "#8c4a32", margin: "0 0 4px", fontWeight: 600 };
const value = { fontSize: "15px", margin: "0 0 4px", color: "#232222" };
const hr = { border: "none", borderTop: "1px solid #BFAC9B", margin: "12px 0" };
const muted = { fontSize: "12px", color: "#6b6b6b", margin: "16px 0 0" };
