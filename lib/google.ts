import { Readable } from "stream";
import { drive as driveApi, auth as gauth } from "@googleapis/drive";
import { docs as docsApi } from "@googleapis/docs";
import { env, optEnv } from "./config";

/**
 * Auth option A: OAuth refresh token (works with a personal Gmail Drive).
 * Auth option B: service account (needs a Shared Drive — service accounts have no storage of their own).
 */
function authClient(): any {
  if (optEnv("GOOGLE_REFRESH_TOKEN")) {
    const client = new gauth.OAuth2(env("GOOGLE_CLIENT_ID"), env("GOOGLE_CLIENT_SECRET"));
    client.setCredentials({ refresh_token: env("GOOGLE_REFRESH_TOKEN") });
    return client;
  }
  const raw = env("GOOGLE_SERVICE_ACCOUNT_JSON");
  const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return new gauth.GoogleAuth({
    credentials: JSON.parse(json),
    scopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/documents"],
  });
}

export function googleConfigured() {
  return (!!optEnv("GOOGLE_REFRESH_TOKEN") || !!optEnv("GOOGLE_SERVICE_ACCOUNT_JSON")) && !!optEnv("PROPOSAL_TEMPLATE_DOC_ID");
}

const ALL = { supportsAllDrives: true } as const;

/**
 * Copy the proposal template, fill its {{placeholders}}, export a PDF and store both in Drive.
 * Template placeholders: {{client_name}} {{company}} {{date}} {{executive_summary}}
 * {{current_situation}} {{strategy}} {{scope}} {{timeline}} {{kpis}} {{investment}} {{next_steps}}
 */
export async function createProposalDocs(title: string, fields: Record<string, string>) {
  const auth = authClient();
  const drive = driveApi({ version: "v3", auth });
  const docs = docsApi({ version: "v1", auth });
  const parents = optEnv("PROPOSALS_FOLDER_ID") ? [optEnv("PROPOSALS_FOLDER_ID")!] : undefined;

  const copy = await drive.files.copy({
    ...ALL,
    fileId: env("PROPOSAL_TEMPLATE_DOC_ID"),
    requestBody: { name: title, parents },
    fields: "id",
  });
  const docId = copy.data.id!;

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: Object.entries(fields).map(([key, value]) => ({
        replaceAllText: { containsText: { text: `{{${key}}}`, matchCase: true }, replaceText: value },
      })),
    },
  });

  const pdf = await drive.files.export({ fileId: docId, mimeType: "application/pdf" }, { responseType: "arraybuffer" });
  const uploaded = await drive.files.create({
    ...ALL,
    requestBody: { name: `${title}.pdf`, parents, mimeType: "application/pdf" },
    media: { mimeType: "application/pdf", body: Readable.from(Buffer.from(pdf.data as ArrayBuffer)) },
    fields: "id, webViewLink",
  });

  if (optEnv("PROPOSAL_LINK_PUBLIC") === "true") {
    await drive.permissions.create({ ...ALL, fileId: uploaded.data.id!, requestBody: { role: "reader", type: "anyone" } });
  }

  return {
    docId,
    docUrl: `https://docs.google.com/document/d/${docId}/edit`,
    pdfUrl: uploaded.data.webViewLink ?? `https://drive.google.com/file/d/${uploaded.data.id}/view`,
  };
}

export async function createClientFolder(name: string): Promise<string | null> {
  if (!optEnv("CLIENTS_FOLDER_ID")) return null;
  const drive = driveApi({ version: "v3", auth: authClient() });
  const res = await drive.files.create({
    ...ALL,
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [optEnv("CLIENTS_FOLDER_ID")!] },
    fields: "id, webViewLink",
  });
  return res.data.webViewLink ?? `https://drive.google.com/drive/folders/${res.data.id}`;
}
