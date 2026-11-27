export interface Session { actor: string; csrf: string }
export interface Page<T> { items: T[]; next: string | null }
export interface User {
  id: string;
  name: string;
  rollNumber: string;
  status: 'pending' | 'active' | 'suspended';
  version: number;
}
export interface Grant { url: string; expiresAt: string }
export interface Broadcast {
  id: string;
  title: string;
  body: string;
  state: 'draft' | 'queued' | 'cancelled';
  scheduledFor: string | null;
  version: number;
  publishedAt: string | null;
  counts: Partial<Record<'pending' | 'sending' | 'accepted' | 'skipped' | 'expired' | 'failed', number>>;
}
export interface Activity { id: string; actor: string; action: string; targetId: string; occurredAt: string }

export class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export type Request = <T>(path: string, method?: string, body?: unknown) => Promise<T>;

export function adminRequest(csrf?: string, onExpired?: () => void): Request {
  return async <T>(path: string,method = 'GET',body?: unknown): Promise<T> => {
    const response = await fetch('/admin/api' + path,{
      method, credentials: 'same-origin', cache: 'no-store',
      headers: {
        accept: 'application/json', ...(csrf && method !== 'GET' && { 'x-csrf-token': csrf }),
        ...(body !== undefined && { 'content-type': 'application/json' }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      if (response.status === 401) onExpired?.();
      const problem = await response.json().catch(() => null);
      const message = response.status < 500 && typeof problem?.message === 'string'
        ? problem.message : 'Scanner could not complete this request. Try again.';
      throw new RequestError(response.status,message);
    }
    return response.status === 204 ? undefined as T : await response.json() as T;
  };
}

export const readableError = (error: unknown) => error instanceof RequestError ? error.message : 'Could not connect to Scanner. Try again.';
const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Yangon', dateStyle: 'medium',timeStyle: 'short',
});
export const myanmarTime = (value: string) => formatter.format(new Date(value));
