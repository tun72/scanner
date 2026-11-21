import Anthropic from '@anthropic-ai/sdk';
import { createAssessFood } from './assessment/assess-food.ts';
import { loadConfig } from './config.ts';
import { buildServer } from './http/server.ts';
import { serveWebApp } from './http/web-app.ts';
import { createClaudeFoodJudge } from './infrastructure/claude-food-judge.ts';
import { createOpenFoodFactsLookup } from './infrastructure/open-food-facts-lookup.ts';
import { createAccounts } from './cloud/accounts.ts';
import { createCloudDatabase, migrateCloudDatabase } from './cloud/database.ts';
import { createCloudHistory } from './cloud/history.ts';
import { createCloudinaryMedia } from './cloud/media.ts';

// Wires the real parts together and starts listening. All decisions live in the modules above.
const config = loadConfig(process.env);

const claude = new Anthropic({ apiKey: config.anthropicApiKey, timeout: config.claudeTimeoutMs, maxRetries: config.claudeMaxRetries });
const judge = createClaudeFoodJudge({
  messages: claude.beta.messages, model: config.model,
  onApiError: details => server.log.warn(details, 'Anthropic request failed'),
});
const products = createOpenFoodFactsLookup({ baseUrl: config.openFoodFactsUrl, userAgent: config.openFoodFactsUserAgent, timeoutMs: config.productLookupTimeoutMs });
const assessFood = createAssessFood({ judge, products, now: () => new Date() });
const databaseUrl = process.env.DATABASE_URL?.trim();
const cloudinaryUrl = process.env.CLOUDINARY_URL?.trim();
if (Boolean(databaseUrl) !== Boolean(cloudinaryUrl)) throw new Error('Configure both DATABASE_URL and CLOUDINARY_URL for account sync.');
const database = databaseUrl ? createCloudDatabase(databaseUrl) : undefined;
if (database) {
  try {
    await migrateCloudDatabase(database);
  } catch {
    await database.end();
    throw new Error('Could not prepare the account database. Check DATABASE_URL and database permissions.');
  }
}
const cloud = database && cloudinaryUrl ? {
  accounts: createAccounts(database), history: createCloudHistory(database, createCloudinaryMedia(cloudinaryUrl)),
} : undefined;
const webRoot = process.env.WEB_ROOT?.trim();
if (webRoot && !cloud) throw new Error('The web app requires DATABASE_URL and CLOUDINARY_URL.');
const server = buildServer({ assessFood, trustedProxies: config.trustedProxies, logLevel: config.logLevel, ...(cloud ? { cloud } : {}) });
if (webRoot) serveWebApp(server, webRoot);
if (cloud && database) {
  let cleanup: Promise<void> | undefined;
  const runCleanup = () => {
    cleanup ??= cloud.history.cleanOnePhoto().catch(() => {
      server.log.warn('Photo cleanup will retry later.');
    }).finally(() => { cleanup = undefined; });
  };
  const timer = setInterval(runCleanup, 5_000);
  timer.unref();
  server.addHook('onClose', async () => {
    clearInterval(timer);
    await cleanup;
    await database.end();
  });
  runCleanup();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}

await server.listen({ host: config.host, port: config.port });
