/** Runtime settings for the API, read once at startup. */
interface CommonApiConfig {
  host: string;
  port: number;
  model: string;
  claudeTimeoutMs: number;
  claudeMaxRetries: number;
  openFoodFactsUrl: string;
  openFoodFactsUserAgent: string;
  productLookupTimeoutMs: number;
  trustedProxies: string[];
  logLevel: string;
}

export type ApiConfig = CommonApiConfig & (
  | { anthropicApiKey: string; geminiApiKey?: never }
  | { geminiApiKey: string; anthropicApiKey?: never }
);

const DEFAULT_PORT = 3000;
const DEFAULT_MODEL = 'claude-opus-5-5';

/** A verdict should arrive within about 10 seconds, so one slow call may not be retried many times. */
const CLAUDE_TIMEOUT_MS = 15_000;
const CLAUDE_MAX_RETRIES = 1;

const DEFAULT_OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org';
/** Open Food Facts asks clients to name themselves; set a contact address for a public release. */
const DEFAULT_OPEN_FOOD_FACTS_USER_AGENT = 'FoodScanner/0.1';
const PRODUCT_LOOKUP_TIMEOUT_MS = 5_000;

function readPort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be a whole number between 1 and 65535.');
  return port;
}

/** A comma-separated list of proxy IPs or CIDR ranges, such as "10.0.0.0/8, 172.16.0.5". */
function readTrustedProxies(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Reads the configuration from environment variables.
 * The Claude key comes only from ANTHROPIC_API_KEY, and its value is never put in an error or a log.
 */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): ApiConfig {
  const useGemini = env.FOOD_SCAN_PROVIDER === 'gemini';
  const keyName = useGemini ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
  const apiKey = env[keyName]?.trim();
  if (!apiKey) throw new Error(`${keyName} is not set. Set it in the environment of the API process.`);
  return {
    host: env.HOST?.trim() || '0.0.0.0',
    port: readPort(env.PORT),
    ...(useGemini ? { geminiApiKey: apiKey } : { anthropicApiKey: apiKey }),
    model: env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL,
    claudeTimeoutMs: CLAUDE_TIMEOUT_MS,
    claudeMaxRetries: CLAUDE_MAX_RETRIES,
    openFoodFactsUrl: env.OPEN_FOOD_FACTS_URL?.trim() || DEFAULT_OPEN_FOOD_FACTS_URL,
    openFoodFactsUserAgent: env.OPEN_FOOD_FACTS_USER_AGENT?.trim() || DEFAULT_OPEN_FOOD_FACTS_USER_AGENT,
    productLookupTimeoutMs: PRODUCT_LOOKUP_TIMEOUT_MS,
    trustedProxies: readTrustedProxies(env.TRUSTED_PROXIES),
    logLevel: env.LOG_LEVEL?.trim() || 'info',
  };
}
