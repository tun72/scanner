import Anthropic from '@anthropic-ai/sdk';
import { createAssessFood } from './assessment/assess-food.ts';
import { loadConfig } from './config.ts';
import { buildServer } from './http/server.ts';
import { createClaudeFoodJudge } from './infrastructure/claude-food-judge.ts';
import { createOpenFoodFactsLookup } from './infrastructure/open-food-facts-lookup.ts';

// Wires the real parts together and starts listening. All decisions live in the modules above.
const config = loadConfig(process.env);

const claude = new Anthropic({ apiKey: config.anthropicApiKey, timeout: config.claudeTimeoutMs, maxRetries: config.claudeMaxRetries });
const judge = createClaudeFoodJudge({ messages: claude.beta.messages, model: config.model });
const products = createOpenFoodFactsLookup({ baseUrl: config.openFoodFactsUrl, userAgent: config.openFoodFactsUserAgent, timeoutMs: config.productLookupTimeoutMs });
const assessFood = createAssessFood({ judge, products, now: () => new Date() });
const server = buildServer({ assessFood, trustedProxies: config.trustedProxies, logLevel: config.logLevel });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}

await server.listen({ host: config.host, port: config.port });
