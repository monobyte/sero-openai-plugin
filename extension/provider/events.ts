import type { ResponseStreamEvent } from 'openai/resources/responses/responses.js';
import type { AssistantMessage } from '@earendil-works/pi-ai';
function classifiedProviderMessage(code: string | undefined, value: unknown): string {
  const source = `${code ?? ''} ${typeof value === 'string' ? value : ''}`;
  if (/context[_ ]length|context window|prompt (?:is )?too long|request_too_large|too many tokens|token limit exceeded|maximum context length/i.test(source)) {
    return 'Your input exceeds the context window of this model.';
  }
  if (/usage_limit_reached|usage_not_included|usage limit/i.test(source)) return 'You have hit your ChatGPT usage limit.';
  if (/rate_limit_exceeded|rate limit|too many requests/i.test(source)) return 'OpenAI Codex rate limit reached.';
  return 'OpenAI Codex provider returned an error.';
}
export class CodexEventError extends Error {
  constructor(readonly code?: string, message?: unknown) { super(classifiedProviderMessage(code, message)); }
}
const STATUSES = new Set(['completed', 'incomplete', 'failed', 'cancelled', 'queued', 'in_progress']);
export async function* normalizeEvents(events: AsyncIterable<Record<string, unknown>>, output?: AssistantMessage): AsyncGenerator<ResponseStreamEvent> {
  let terminal = false;
  for await (const event of events) {
    if (event.type === 'error' || event.type === 'response.failed') {
      const nested = typeof event.error === 'object' && event.error !== null ? event.error as Record<string, unknown> : undefined;
      const response = typeof event.response === 'object' && event.response !== null ? event.response as Record<string, unknown> : undefined;
      const responseError = typeof response?.error === 'object' && response.error !== null ? response.error as Record<string, unknown> : undefined;
      const code = typeof event.code === 'string' ? event.code : typeof nested?.code === 'string' ? nested.code : typeof responseError?.code === 'string' ? responseError.code : undefined;
      const message = typeof event.message === 'string' ? event.message : typeof nested?.message === 'string' ? nested.message : responseError?.message;
      throw new CodexEventError(code, message);
    }
    if (event.type === 'response.done' || event.type === 'response.incomplete' || event.type === 'response.completed') {
      terminal = true;
      const response = typeof event.response === 'object' && event.response !== null ? event.response as Record<string, unknown> : undefined;
      if (typeof response?.end_turn === 'boolean' && output) output.endTurn = response.end_turn;
      const normalized = response ? { ...response, status: typeof response.status === 'string' && STATUSES.has(response.status) ? response.status : undefined } : response;
      yield { ...event, type: 'response.completed', response: normalized } as unknown as ResponseStreamEvent; return;
    }
    yield event as unknown as ResponseStreamEvent;
  }
  if (!terminal) throw new Error('OpenAI Codex stream ended before completion.');
}
