import Anthropic from "@anthropic-ai/sdk";
import { env, optEnv } from "./config";

let client: Anthropic | null = null;
function anthropic() {
  const workspace = optEnv("ANTHROPIC_WORKSPACE_ID");
  client ??= new Anthropic({
    apiKey: env("ANTHROPIC_API_KEY"),
    // Needed only for API keys that aren't scoped to a workspace
    ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}),
  });
  return client;
}

export const MODEL = () => optEnv("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";

type Schema = Record<string, any>;

/** Structured outputs require `additionalProperties: false` on every object. */
function strict(schema: Schema): Schema {
  if (!schema || typeof schema !== "object") return schema;
  const out: Schema = { ...schema };
  if (out.type === "object") {
    out.additionalProperties = false;
    if (out.properties) {
      out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, strict(v as Schema)]));
    }
  }
  if (out.items) out.items = strict(out.items);
  return out;
}

/** Enum values can come back with different capitalisation — snap them to the schema's spelling. */
function normalize(value: any, schema: Schema): any {
  if (value === null || value === undefined || !schema) return value;
  if (schema.enum && typeof value === "string") {
    return schema.enum.find((e: string) => e.toLowerCase() === value.toLowerCase()) ?? value;
  }
  if (schema.type === "array" && Array.isArray(value)) return value.map((v) => normalize(v, schema.items));
  if (schema.type === "object" && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v, schema.properties?.[k])]));
  }
  return value;
}

/**
 * Ask Claude for JSON that is guaranteed to match `schema`
 * (structured outputs via `output_config.format`).
 */
export async function structured<T>(opts: {
  system: string;
  prompt: string;
  name: string;
  description: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const schema = strict({ type: "object", ...opts.schema });
  let maxTokens = opts.maxTokens ?? 2500;
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await anthropic().messages.create({
      model: MODEL(),
      max_tokens: maxTokens,
      system: `${opts.system}\n\nTask: ${opts.description}`,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: { format: { type: "json_schema", schema } },
    } as any);
    if (msg.stop_reason === "max_tokens" && attempt === 0) { maxTokens *= 2; continue; }
    if (msg.stop_reason === "refusal") throw new Error("AI declined this request");
    const text = msg.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("AI returned no structured output");
    return normalize(JSON.parse(text.text), schema) as T;
  }
  throw new Error("AI response was cut off — try again");
}

// small schema helpers
export const str = (description: string) => ({ type: "string", description });
export const num = (description: string) => ({ type: "number", description });
export const strArr = (description: string) => ({ type: "array", items: { type: "string" }, description });
export const oneOf = (values: string[], description: string) => ({ type: "string", enum: values, description });
