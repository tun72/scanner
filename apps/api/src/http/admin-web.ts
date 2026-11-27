import { createReadStream, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';

export function serveAdminWeb(server: FastifyInstance, root: string) {
  server.get('/admin', (_request,reply) => reply.redirect('/admin/'));
  server.get('/admin/', (_request,reply) => reply
    .header('cache-control','no-store')
    .header('x-content-type-options','nosniff')
    .header('referrer-policy','no-referrer')
    .header('content-security-policy',"default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
    .type('text/html; charset=utf-8').send(createReadStream(join(root,'index.html'))));
  for (const asset of readdirSync(join(root,'assets'),{ withFileTypes: true })) {
    if (!asset.isFile() || !/^[\w.-]+\.(js|css)$/.test(asset.name)) continue;
    server.get('/admin/assets/' + asset.name,(_request,reply) => reply
      .header('cache-control','public, max-age=86400')
      .header('x-content-type-options','nosniff')
      .type(asset.name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8')
      .send(createReadStream(join(root,'assets',asset.name))));
  }
}
