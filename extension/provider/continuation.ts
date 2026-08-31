import type { ResponseInput } from 'openai/resources/responses/responses.js';
import type { CodexRequestBody } from './types';

export interface SocketLike { readyState?: number; send(data: string): void; close(code?: number, reason?: string): void; addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: (event: unknown) => void): void; removeEventListener(type: 'open' | 'message' | 'error' | 'close', listener: (event: unknown) => void): void }
export interface Connection { socket: SocketLike; routeKey: string; busy: boolean; cached?: boolean; createdAt?: number; timer?: ReturnType<typeof setTimeout>; continuation?: { body: CodexRequestBody; responseId: string; responseItems: ResponseInput } }
const connections = new Map<string, Connection>();
const MAX_CONNECTION_AGE_MS = 55 * 60 * 1000;
export function takeConnection(routeKey: string, sessionId?: string): Connection | undefined {
  if (!sessionId) return undefined;
  for (const [cachedKey, cached] of connections) {
    if (cachedKey.startsWith(`${sessionId}|`) && cached.routeKey !== routeKey) {
      if (cached.timer) clearTimeout(cached.timer);
      cached.socket.close(1000, 'route_changed');
      connections.delete(cachedKey);
    }
  }
  const key = `${sessionId}|${routeKey}`; const entry = connections.get(key);
  if (entry && !entry.busy && Date.now() - (entry.createdAt ?? 0) >= MAX_CONNECTION_AGE_MS) { entry.socket.close(1000, 'connection_age_limit'); connections.delete(key); return undefined; }
  if (entry && !entry.busy && entry.socket.readyState !== undefined && entry.socket.readyState !== 1) { entry.socket.close(1000, 'not_reusable'); connections.delete(key); return undefined; }
  if (!entry || entry.busy) return undefined;
  if (entry.timer) clearTimeout(entry.timer); entry.busy = true; return entry;
}
export function storeConnection(sessionId: string | undefined, connection: Connection): void {
  if (!sessionId) return;
  const key = `${sessionId}|${connection.routeKey}`; if (connections.has(key)) { connection.cached = false; return; }
  connection.createdAt ??= Date.now(); connection.cached = true; connections.set(key, connection);
}
export function releaseConnection(sessionId: string | undefined, connection: Connection, keep: boolean): void {
  if (!sessionId || !connection.cached || !keep) { connection.socket.close(1000, 'done'); if (sessionId && connection.cached) connections.delete(`${sessionId}|${connection.routeKey}`); return; }
  connection.busy = false; connection.timer = setTimeout(() => { connection.socket.close(1000, 'idle'); connections.delete(`${sessionId}|${connection.routeKey}`); }, 300_000);
}
function withoutInput(body: CodexRequestBody): string { const { input: _input, previous_response_id: _previous, ...rest } = body; return JSON.stringify(rest); }
export function continuationBody(connection: Connection, body: CodexRequestBody): CodexRequestBody {
  const state = connection.continuation; if (!state || withoutInput(state.body) !== withoutInput(body)) return body;
  const baseline = [...state.body.input, ...state.responseItems]; const current = body.input;
  if (current.length < baseline.length || JSON.stringify(current.slice(0, baseline.length)) !== JSON.stringify(baseline)) { connection.continuation = undefined; return body; }
  return { ...body, previous_response_id: state.responseId, input: current.slice(baseline.length) };
}
export function closeOwnedSockets(sessionId?: string): void { for (const [key, connection] of connections) if (!sessionId || key.startsWith(`${sessionId}|`)) { if (connection.timer) clearTimeout(connection.timer); connection.socket.close(1000, 'shutdown'); connections.delete(key); } }
