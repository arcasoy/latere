import { hasLLM } from "@latere/core";
import { hasToken, isUploadConfigured } from "@latere/publish";

export interface Connector {
  name: string;
  connected: boolean;
  paused?: boolean;
  detail: string;
}

export type ConnectorsBySection = Record<string, Connector[]>;

function fromEnv(name: string, ...vars: string[]): Connector {
  const gaps = vars.filter((v) => !process.env[v]);
  return {
    name,
    connected: gaps.length === 0,
    detail: gaps.length ? `missing ${gaps.join(", ")}` : "credentials present",
  };
}

function fromPredicate(name: string, ok: boolean, missing: string): Connector {
  return { name, connected: ok, detail: ok ? "credentials present" : `missing ${missing}` };
}

function unwired(name: string): Connector {
  return { name, connected: false, paused: true, detail: "Planned integration — not connected" };
}

export function connectors(): ConnectorsBySection {
  return {
    acquisition: [
      fromEnv(
        "App Store Connect",
        "ASC_KEY_ID",
        "ASC_ISSUER_ID",
        "ASC_PRIVATE_KEY",
        "ASC_VENDOR_NUMBER",
        "ASC_APP_ID",
      ),
    ],
    payback: [unwired("AppsFlyer"), unwired("RevenueCat"), unwired("Ad spend")],
    content: [
      fromPredicate("Buffer", hasToken(), "BUFFER_ACCESS_TOKEN"),
      fromPredicate(
        "Latere Supabase",
        isUploadConfigured(),
        "LATERE_SUPABASE_URL / LATERE_SUPABASE_SECRET_KEY",
      ),
      fromPredicate("OpenRouter", hasLLM(), "OPENROUTER_API_KEY"),
    ],
  };
}
