import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultConfig } from '../../shared/config';
import { setModelEnabled, setOverride } from '../../shared/state';

const mocks = vi.hoisted(() => ({ config: undefined as ReturnType<typeof createDefaultConfig> | undefined }));
vi.mock('../state-io', () => ({ resolveStatePath: () => '/profile/state.json', readConfig: vi.fn(async () => mocks.config!) }));
vi.mock('../tools', () => ({ registerOwnedTools: vi.fn() }));
import openAIExtender from '../index';

const supported = { provider: 'openai', api: 'openai-responses', id: 'gpt-5.4' };
function harness() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>(); let active = ['read', 'other_tool', 'openai_extender_web_search'];
  const pi = {
    on: (name: string, handler: (...args: unknown[]) => unknown) => handlers.set(name, handler),
    getAllTools: () => [], getActiveTools: () => active,
    setActiveTools: vi.fn((next: string[]) => { active = next; }),
  };
  openAIExtender(pi as never);
  const ctx = { model: supported, modelRegistry: { isUsingOAuth: () => false }, ui: { notify: vi.fn() } };
  return { handlers, pi, ctx, active: () => active };
}

describe('extension lifecycle', () => {
  beforeEach(() => { mocks.config = createDefaultConfig(); });
  it('retains desired owned tools and preserves foreign tools across turns', async () => {
    mocks.config = setOverride(setModelEnabled(createDefaultConfig(), 'openai/gpt-5.4', true), 'openai/gpt-5.4', 'webTools', true);
    const { handlers, ctx, active } = harness();
    await handlers.get('before_agent_start')!({ systemPrompt: 'Sero and project context' }, ctx as never);
    expect(active()).toEqual(['read', 'other_tool', 'openai_extender_web_search', 'openai_extender_read_page']);
  });
  it('removes only plugin-owned tools when the selected model becomes disabled', async () => {
    const { handlers, ctx, active } = harness();
    await handlers.get('model_select')!({ model: supported }, ctx as never);
    expect(active()).toEqual(['read', 'other_tool']);
  });
  it('clears session state on shutdown', async () => {
    const { handlers, ctx, pi } = harness();
    await handlers.get('session_start')!({}, ctx as never);
    handlers.get('session_shutdown')!();
    expect(pi.setActiveTools).toHaveBeenCalled();
  });
});
