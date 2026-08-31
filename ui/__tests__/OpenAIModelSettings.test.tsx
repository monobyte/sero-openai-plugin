// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { createDefaultConfig, type OpenAIModelEnhancementConfig } from '../../shared/config';

const runtime = vi.hoisted(() => ({
  state: undefined as OpenAIModelEnhancementConfig | undefined,
  listeners: new Set<(value: OpenAIModelEnhancementConfig) => void>(),
  run: vi.fn(),
}));

vi.mock('@sero-ai/app-runtime', async () => {
  const React = await import('react');
  return {
    useAppState: (initial: OpenAIModelEnhancementConfig) => {
      const [value, setValue] = React.useState(runtime.state ?? initial);
      React.useEffect(() => { runtime.listeners.add(setValue); return () => { runtime.listeners.delete(setValue); }; }, []);
      return [value, vi.fn(), true];
    },
    useAppTools: () => ({ run: runtime.run }),
    useAvailableModels: () => ({ groups: [{ provider: 'openai', models: [{ modelId: 'gpt-5.4' }] }], loading: false, error: null }),
  };
});
import OpenAIModelSettings from '../OpenAIModelSettings';

let roots: Root[] = [];
function render(node: ReactNode): HTMLElement {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container); roots.push(root); act(() => root.render(node)); return container;
}
function button(container: HTMLElement, name: string): HTMLButtonElement {
  const result = [...container.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === name || entry.getAttribute('aria-label') === name);
  if (!(result instanceof HTMLButtonElement)) throw new Error(`Missing button ${name}`); return result;
}
async function flush(): Promise<void> { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

beforeEach(() => { runtime.state = createDefaultConfig(); runtime.listeners.clear(); runtime.run.mockReset(); });
afterEach(() => { for (const root of roots) act(() => root.unmount()); roots = []; document.body.replaceChildren(); });

describe('OpenAIModelSettings', () => {
  it('keeps a failed save draft and reset restores the watched saved state', async () => {
    runtime.run.mockRejectedValueOnce(new Error('Save failed safely.'));
    const view = render(<OpenAIModelSettings />); const web = button(view, 'Web tools');
    act(() => web.click()); act(() => button(view, 'Save').click()); await flush();
    expect(view.querySelector('[role="status"]')?.textContent).toBe('Save failed safely.');
    expect(web.getAttribute('aria-checked')).toBe('true');
    act(() => button(view, 'Reset').click());
    expect(web.getAttribute('aria-checked')).toBe('false');
  });

  it('shows busy and success states and refreshes a second mount from the shared watcher', async () => {
    runtime.run.mockImplementation(async (_name: string, params: { value: OpenAIModelEnhancementConfig }) => {
      await Promise.resolve(); runtime.state = params.value;
      for (const listener of runtime.listeners) listener(params.value);
      return { text: 'saved', content: [], details: {}, isError: false };
    });
    const first = render(<OpenAIModelSettings />); const second = render(<OpenAIModelSettings />);
    act(() => button(first, 'Web tools').click()); act(() => button(first, 'Save').click());
    expect(button(first, 'Saving…').disabled).toBe(true); await flush();
    expect(first.querySelector('[role="status"]')?.textContent).toBe('Saved');
    expect(button(second, 'Web tools').getAttribute('aria-checked')).toBe('true');
    expect(runtime.run).toHaveBeenCalledWith('openai_extender_settings', expect.objectContaining({ action: 'save' }));
  });

  it('provides named native controls and polite status output', () => {
    const view = render(<OpenAIModelSettings />);
    expect(button(view, 'Web tools').getAttribute('role')).toBe('switch');
    expect(view.querySelector('select[aria-label="Verbosity"]')).not.toBeNull();
    expect(view.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
  });

  it('has no automatic accessibility violations at desktop and compact widths', async () => {
    for (const width of [900, 640]) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      const view = render(<OpenAIModelSettings />);
      const result = await axe.run(view);
      expect(result.violations).toEqual([]);
      view.remove();
    }
  });

  it('retains a draft when watched state changes and sends its original conflict base', async () => {
    runtime.run.mockResolvedValue({ text: 'conflict', content: [], details: {}, isError: true });
    const view = render(<OpenAIModelSettings />); const original = runtime.state!;
    act(() => button(view, 'Web tools').click());
    const external = { ...original, defaults: { ...original.defaults, fastMode: true } };
    act(() => { runtime.state = external; for (const listener of runtime.listeners) listener(external); });
    expect(button(view, 'Web tools').getAttribute('aria-checked')).toBe('true');
    act(() => button(view, 'Save').click()); await flush();
    expect(runtime.run).toHaveBeenCalledWith('openai_extender_settings', expect.objectContaining({ base: original }));
    expect(button(view, 'Web tools').getAttribute('aria-checked')).toBe('true');
  });
});
