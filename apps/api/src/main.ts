import Anthropic from '@anthropic-ai/sdk';
import { createAssessFood } from './assessment/assess-food.ts';
import { loadConfig } from './config.ts';
import { loadEnv } from './env.ts';
import { buildServer } from './http/server.ts';
import { createAdminIdentity } from './admin/identity.ts';
import { createAdminPasswordIdentity } from './admin/password-identity.ts';
import { registerAdminRoutes } from './admin/routes.ts';
import { createBroadcasts } from './announcements/broadcasts.ts';
import { createBroadcastDelivery } from './announcements/delivery.ts';
import { startBroadcastProcessor } from './announcements/processor.ts';
import { serveAdminWeb } from './http/admin-web.ts';
import { serveWebApp } from './http/web-app.ts';
import { createClaudeFoodJudge } from './infrastructure/claude-food-judge.ts';
import { createGeminiFoodJudge } from './infrastructure/gemini-food-judge.ts';
import { createOpenFoodFactsLookup } from './infrastructure/open-food-facts-lookup.ts';
import { createAccounts } from './cloud/accounts.ts';
import { createCloudDatabase, migrateCloudDatabase } from './cloud/database.ts';
import { createCloudHistory } from './cloud/history.ts';
import { createCloudinaryMedia } from './cloud/media.ts';
import { createBroadcastSender, createWebPush } from './cloud/web-push.ts';
import { createPushSubscriptions } from './cloud/push-subscriptions.ts';

loadEnv();

// Wires the real parts together and starts listening. All decisions live in the modules above.
const config = loadConfig(process.env);

const requireFoodOnlyPhoto = config.geminiApiKey !== undefined;
const judge = config.geminiApiKey !== undefined
  ? createGeminiFoodJudge({
    apiKey: config.geminiApiKey, model: config.geminiModel,
    onStatus: status => server.log.warn({ status }, 'Gemini request failed'),
  })
  : createClaudeFoodJudge({
    messages: new Anthropic({
      apiKey: config.anthropicApiKey, timeout: config.claudeTimeoutMs, maxRetries: config.claudeMaxRetries,
    }).beta.messages,
    model: config.model,
    onApiError: details => server.log.warn(details, 'Anthropic request failed'),
  });
const products = createOpenFoodFactsLookup({ baseUrl: config.openFoodFactsUrl, userAgent: config.openFoodFactsUserAgent, timeoutMs: config.productLookupTimeoutMs });
const assessFood = createAssessFood({ judge, products, requireFoodOnlyPhoto, now: () => new Date() });
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
const push = createWebPush(process.env);
const broadcastSender = push && createBroadcastSender(process.env);
const broadcastDelivery = database && broadcastSender && createBroadcastDelivery(database,broadcastSender);
let broadcastProcessor: ReturnType<typeof startBroadcastProcessor> | undefined;
const cloud = database && cloudinaryUrl ? {
  accounts: createAccounts(database), announcements: createBroadcasts(database), history: createCloudHistory(database, createCloudinaryMedia(cloudinaryUrl)),
  ...(push && { push, pushSubscriptions: createPushSubscriptions(database, push) }),
  ...(broadcastDelivery && { processBroadcasts: async () => { await broadcastProcessor?.run(); } }),
} : undefined;
const webRoot = process.env.WEB_ROOT?.trim();
if (webRoot && !cloud) throw new Error('The web app requires DATABASE_URL and CLOUDINARY_URL.');
const server = buildServer({
  assessFood, requireFoodOnlyPhoto, trustedProxies: config.trustedProxies, logLevel: config.logLevel, ...(cloud ? { cloud } : {}),
});
if (webRoot) serveWebApp(server, webRoot);
if (database) {
  const admin = await createAdminPasswordIdentity(process.env) ?? createAdminIdentity(process.env);
  registerAdminRoutes(server,database,admin);
  const adminRoot = process.env.ADMIN_WEB_ROOT?.trim();
  if (admin && adminRoot) serveAdminWeb(server,adminRoot);
}
if (cloud && database) {
  if (broadcastDelivery) broadcastProcessor = startBroadcastProcessor(broadcastDelivery, () => {
    server.log.warn('Scanner notification processing failed. Queued work will retry.');
  });
  let cleanup: Promise<void> | undefined;
  const runCleanup = () => {
    cleanup ??= Promise.allSettled([
      cloud.history.cleanOnePhoto(),
      cloud.pushSubscriptions?.sendOneRequestedTest(),
    ]).then(([photos, pushTest]) => {
      if (photos.status === 'rejected') server.log.warn('Photo cleanup will retry later.');
      if (pushTest.status === 'rejected') server.log.warn('One-time push test processing failed.');
    }).finally(() => { cleanup = undefined; });
  };
  const timer = setInterval(runCleanup, 5_000);
  timer.unref();
  server.addHook('onClose', async () => {
    clearInterval(timer);
    await Promise.all([cleanup,broadcastProcessor?.stop()]);
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
