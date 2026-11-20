import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  /** The parsed JSON body, or undefined when the request had none. */
  body: any;
}

/** A local HTTP server standing in for an outside service: it records each request and answers as told. */
export interface StandIn {
  baseURL: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

export async function startStandIn(respond: (request: RecordedRequest) => { status?: number; body: unknown }): Promise<StandIn> {
  const requests: RecordedRequest[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      const recorded: RecordedRequest = { method: request.method ?? '', path: request.url ?? '', headers: request.headers, body: text ? JSON.parse(text) : undefined };
      requests.push(recorded);
      const { status = 200, body } = respond(recorded);
      response.writeHead(status, { 'content-type': 'application/json', 'request-id': 'req_standin' });
      response.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseURL: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

/** A Claude Messages API reply whose only content is the given text. */
export const claudeReply = (text: string) => ({
  id: 'msg_standin',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 1234, output_tokens: 210 },
});
