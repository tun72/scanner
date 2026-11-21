import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

export function serveWebApp(server: FastifyInstance, root: string) {
  server.register(async web => {
    await web.register(fastifyStatic, { root, index: false, wildcard: false });
    for (const route of ['/', '/login', '/notice', '/profile', '/scan', '/history', '/history/:id']) {
      web.get(route, (_, reply) => reply.header('cache-control', 'no-cache').sendFile('index.html', { cacheControl: false }));
    }
  });
}
