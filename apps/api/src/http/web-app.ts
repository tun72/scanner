import { createReadStream, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
};

export function serveWebApp(server: FastifyInstance, root: string) {
  const send = (reply: FastifyReply, file: string, cache = 'no-cache') =>
    reply.header('cache-control', cache)
      .header('x-content-type-options', 'nosniff')
      .type(contentTypes[extname(file)] ?? 'application/octet-stream')
      .send(createReadStream(join(root, file)));

  for (const route of ['/', '/login', '/notice', '/profile', '/scan', '/history', '/history/:id']) {
    server.get(route, (_, reply) => send(reply, 'index.html'));
  }
  for (const file of ['app-icon.png', 'app-icon-192.png', 'favicon.ico', 'manifest.webmanifest']) {
    server.get('/' + file, (_, reply) => send(reply, file));
  }

  // Register only files exported by Expo. Request URLs never become filesystem paths.
  for (const directory of ['_expo', 'assets']) {
    for (const file of readdirSync(join(root, directory), { recursive: true, withFileTypes: true })) {
      if (!file.isFile()) continue;
      const path = relative(root, join(file.parentPath, file.name));
      server.get('/' + path, (_, reply) => send(reply, path, 'public, max-age=86400'));
    }
  }
}
