import { SessionSchema, type AccountSession } from '@food-scanner/contracts';
import { Platform } from 'react-native';
import * as sessionStorage from './session-storage';

const configuredApi = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
const browserOrigin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : '';
export const apiBase = browserOrigin || (configuredApi.startsWith('https://') || (__DEV__ && configuredApi.startsWith('http://')) ? configuredApi : '');
const sessionKey = 'mobile-account-session';
const revocationKey = 'pending-mobile-signout';
let current: AccountSession | null = null;
const listeners = new Set<(session: AccountSession | null) => void>();

export const activeSession = () => current;
export function subscribeSession(listener: (session: AccountSession | null) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function publish(session: AccountSession | null) {
  current = session;
  for (const listener of listeners) listener(session);
}

export class AccountRequestError extends Error {
  constructor(readonly status: number) {
    super('Food Scanner could not complete the request.');
  }
}

export async function accountRequest(path: string, init: RequestInit = {}, session = activeSession()) {
  if (!apiBase) throw new AccountRequestError(0);
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body) headers.set('content-type', 'application/json');
  if (session) headers.set('authorization', `Bearer ${session.token}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${apiBase}${path}`, { ...init, headers, signal: controller.signal });
    if (response.status === 401 && session) void invalidateSession(session).catch(() => undefined);
    if (!response.ok) throw new AccountRequestError(response.status);
    return response;
  } catch (error) {
    if (error instanceof AccountRequestError) throw error;
    throw new AccountRequestError(0);
  } finally {
    clearTimeout(timer);
  }
}

export async function invalidateSession(session: AccountSession) {
  if (current?.token !== session.token) return;
  publish(null);
  await sessionStorage.deleteItemAsync(sessionKey);
}

async function retrySignOut() {
  const saved = await sessionStorage.getItemAsync(revocationKey);
  if (!saved) return;
  const pending = SessionSchema.safeParse(JSON.parse(saved)).data;
  if (pending && Date.parse(pending.expiresAt) > Date.now()) await accountRequest('/v1/session', { method: 'DELETE' }, pending);
  await sessionStorage.deleteItemAsync(revocationKey);
}

export async function restoreSession() {
  void retrySignOut().catch(() => undefined);
  try {
    const stored = await sessionStorage.getItemAsync(sessionKey);
    const session = stored ? SessionSchema.safeParse(JSON.parse(stored)).data : undefined;
    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      publish(null);
      if (stored) await sessionStorage.deleteItemAsync(sessionKey);
      return null;
    }
    // Open the owner-scoped offline history while a remote check runs.
    publish(session);
    void accountRequest('/v1/session', {}, session).catch(() => undefined);
    return session;
  } catch {
    publish(null);
    return null;
  }
}

export async function signIn(rollNumber: string, password: string) {
  const response = await accountRequest('/v1/session', {
    method: 'POST', body: JSON.stringify({ rollNumber, password }),
  }, null);
  const session = SessionSchema.parse(await response.json());
  await sessionStorage.setItemAsync(sessionKey, JSON.stringify(session));
  publish(session);
  void retrySignOut().catch(() => undefined);
}

export async function signOut() {
  const session = activeSession();
  if (!session) return;
  await sessionStorage.setItemAsync(revocationKey, JSON.stringify(session));
  await invalidateSession(session);
  void retrySignOut().catch(() => undefined);
}
