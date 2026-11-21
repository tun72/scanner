import rateLimit from '@fastify/rate-limit';
import { CloudPhotoSchema, ScanRequestSchema, type CloudScan } from '@food-scanner/contracts';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AssessFood, AssessmentOutcome } from '../assessment/assess-food.ts';
import { aiUnavailable, invalidRequest, rateLimited } from '../assessment/errors.ts';
import { registerCloudRoutes, requireOwner, type CloudServices } from '../cloud/routes.ts';

export interface ScanLimits {
  perInstallPerHour: number;
  perIpPerHour: number;
}

/** One install is one phone; an IP may be a household or an office, so it gets more room. */
export const DEFAULT_SCAN_LIMITS: ScanLimits = { perInstallPerHour: 30, perIpPerHour: 120 };

export interface ServerOptions {
  assessFood: AssessFood;
  scanLimits?: ScanLimits;
  /**
   * Addresses (IPs or CIDR ranges) of the proxies in front of the API whose forwarding headers
   * may be trusted for the caller's IP. Empty uses the connection's own address; behind a load
   * balancer that would make every user share one IP limit.
   */
  trustedProxies?: readonly string[];
  logLevel?: string;
  /** Where log lines go; standard output when left out. */
  logStream?: NodeJS.WritableStream;
  cloud?: CloudServices;
}

/** Above the 1.5 MB photo limit once base64-encoded, so the photo rule, not this limit, decides. */
const BODY_LIMIT_BYTES = 2_621_440;
const ONE_HOUR_MS = 3_600_000;

/** Never logged, even if a future change logs a body by mistake. */
const REDACTED_LOG_PATHS = ['req.body', 'req.headers.authorization', 'body', 'password', 'token', 'photo', 'profile', 'notes', '*.photo', '*.profile', '*.notes'];

/** Logs the matched route, not the raw URL, so nothing a caller puts in a query string reaches the logs. */
const describeRequest = (request: FastifyRequest): { method: string; route: string } => ({
  method: request.method,
  route: request.routeOptions?.url ?? 'unmatched',
});

const STATUS_BY_OUTCOME: Readonly<Record<AssessmentOutcome['kind'], number>> = { verdict: 200, refused: 400, 'not-found': 404, unavailable: 503 };

/** One log line per scan: what kind, how it ended, how long and how many tokens. Nothing about the user. */
function describeScan(outcome: AssessmentOutcome, latencyMs: number): Record<string, unknown> {
  return {
    kind: outcome.scanKind ?? 'unknown',
    outcome: outcome.kind === 'verdict' ? outcome.response.level : outcome.error.code,
    latencyMs,
    ...('usage' in outcome && outcome.usage !== undefined ? { usage: outcome.usage } : {}),
    ...(outcome.kind === 'unavailable' ? { failure: outcome.failure } : {}),
  };
}

const isClientError = (error: FastifyError): boolean => typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500;

const InstallIdSchema = z.object({ installId: z.uuid() });

/** The install ID of a request, when its body carries a valid one. */
const installIdOf = (request: FastifyRequest): string | undefined => InstallIdSchema.safeParse(request.body).data?.installId;

type LimitCheck = (request: FastifyRequest) => Promise<{ isAllowed: true } | { isAllowed: false; isExceeded: boolean; ttlInSeconds: number }>;

/** Turns a limit into a route hook that answers 429 once the limit is passed. */
const refuseWhenOver = (check: LimitCheck) => async (request: FastifyRequest, reply: FastifyReply) => {
  const result = await check(request);
  if (result.isAllowed || !result.isExceeded) return;
  const error = rateLimited(result.ttlInSeconds);
  return reply.code(429).header('retry-after', error.retryAfterSeconds).send(error);
};

/** Builds the HTTP server around the use case. Starting it is left to the caller. */
export function buildServer({ assessFood, scanLimits = DEFAULT_SCAN_LIMITS, trustedProxies = [], logLevel = 'info', logStream, cloud }: ServerOptions): FastifyInstance {
  const server = Fastify({
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: trustedProxies.length > 0 ? [...trustedProxies] : false,
    logger: {
      level: logLevel,
      redact: REDACTED_LOG_PATHS,
      serializers: { req: describeRequest },
      ...(logStream === undefined ? {} : { stream: logStream }),
    },
  });

  // Fastify's own errors (body too large, broken JSON, wrong content type) become the same
  // invalid-request the app already understands. Anything else is a fault on our side: it is
  // logged, and the user gets the fixed unavailable message with no internal detail.
  server.setErrorHandler<FastifyError>((error, request, reply) => {
    if (isClientError(error)) return reply.code(400).send(invalidRequest());
    request.log.error({ errorType: error.name }, 'unexpected error');
    return reply.code(503).send(aiUnavailable());
  });

  // Counters live in this process's memory: enough for one instance, and nothing about a user is kept on disk.
  server.register(rateLimit, { global: false });

  server.get('/health', async () => ({ status: 'ok' }));
  if (cloud) registerCloudRoutes(server, cloud);

  server.register(async (scans) => {
    // Both limits share the plugin's store, so each key says which limit it belongs to.
    const underIpLimit = scans.createRateLimit({ max: scanLimits.perIpPerHour, timeWindow: ONE_HOUR_MS, keyGenerator: (request) => `ip:${request.ip}` });
    const underInstallLimit = scans.createRateLimit({
      max: scanLimits.perInstallPerHour,
      timeWindow: ONE_HOUR_MS,
      keyGenerator: (request) => `install:${installIdOf(request) ?? ''}`,
      // A request without a valid install ID is refused by the request check anyway; the IP limit still counts it.
      allowList: (request) => installIdOf(request) === undefined,
    });

    scans.post(
      '/v1/assessments',
      // The IP is known before the body is read, so a flood is turned away early; the install ID is inside the body.
      { onRequest: refuseWhenOver(underIpLimit), preHandler: refuseWhenOver(underInstallLimit) },
      async (request, reply) => {
        const startedAt = performance.now();
        if (cloud) {
          reply.header('cache-control', 'private, no-store');
          const owner = await requireOwner(cloud, request, reply);
          if (!owner) return;
          const id = z.uuid().safeParse(request.headers['idempotency-key']).data;
          const body = ScanRequestSchema.safeParse(request.body).data;
          if (!id || !body || (body.kind === 'photo' && !CloudPhotoSchema.safeParse(body.photo).success)) {
            return reply.code(400).send(invalidRequest());
          }
          const photo = body.kind === 'photo' ? body.photo : null;
          const result = await cloud.history.assess(owner, id, photo, async () => {
            const outcome = await assessFood(body);
            request.log.info({ scan: describeScan(outcome, Math.round(performance.now() - startedAt)) }, 'scan assessed');
            return outcome;
          }, (outcome): CloudScan | null => outcome.kind === 'verdict' ? {
            id, scannedAt: outcome.response.assessedAt, verdict: outcome.response, photoState: photo ? 'pending' : 'none',
          } : null);
          if (result.kind === 'missing') return reply.code(400).send(invalidRequest());
          if (result.kind === 'saved') return result.scan;
          const outcome = result.outcome;
          return reply.code(STATUS_BY_OUTCOME[outcome.kind]).send(outcome.kind === 'verdict' ? outcome.response : outcome.error);
        }
        const outcome = await assessFood(request.body);
        request.log.info({ scan: describeScan(outcome, Math.round(performance.now() - startedAt)) }, 'scan assessed');
        return reply.code(STATUS_BY_OUTCOME[outcome.kind]).send(outcome.kind === 'verdict' ? outcome.response : outcome.error);
      },
    );
  });

  return server;
}
