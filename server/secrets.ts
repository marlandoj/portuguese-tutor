import { readFileSync } from "node:fs";

const DEFAULT_SECRETS_PATH = "/root/.zo_secrets";
const PROVIDER_SECRET_NAMES = [
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "DEEPGRAM_API_KEY",
  "ANAM_API_KEY",
] as const;

type ProviderSecretName = (typeof PROVIDER_SECRET_NAMES)[number];
export type ProviderSecrets = Partial<Record<ProviderSecretName, string>>;

function parseSecretsFile(path: string): Record<string, string> {
  const secrets: Record<string, string> = {};
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/u);
      if (!match) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      secrets[match[1]] = value;
    }
  } catch {
    return secrets;
  }
  return secrets;
}

export function loadProviderSecrets(
  path = process.env.ZO_SECRETS_PATH?.trim() || DEFAULT_SECRETS_PATH,
  environment: NodeJS.ProcessEnv = process.env
): ProviderSecrets {
  const fileSecrets = parseSecretsFile(path);
  return Object.fromEntries(
    PROVIDER_SECRET_NAMES.map((name) => [name, environment[name]?.trim() || fileSecrets[name]?.trim()])
  ) as ProviderSecrets;
}
