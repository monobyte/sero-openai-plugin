// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultConfig } from '../../shared/config';
import { setEnabled } from '../../shared/state';

const runtime = vi.hoisted(() => ({ state: undefined as unknown, open: vi.fn() }));
vi.mock('@sero-ai/app-runtime', () => ({
  useAppState: () => [runtime.state, vi.fn(), true],
  openSeroApp: runtime.open,
}));
import OpenAIChatShortcut from '../OpenAIChatShortcut';

afterEach(() => { document.body.replaceChildren(); runtime.open.mockReset(); runtime.state = createDefaultConfig(); });

describe('OpenAIChatShortcut', () => {
  it('shows inactive state and opens the OpenAI Admin model settings page', () => {
    runtime.state = createDefaultConfig();
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container); act(() => root.render(<OpenAIChatShortcut />));
    const button = container.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Configure OpenAI enhancements');
    act(() => button?.click());
    expect(runtime.open).toHaveBeenCalledWith('admin', {
      section: 'model',
      modelSettingsKey: 'openai-extender:ui.admin.model-settings:openai-model-settings',
    });
    act(() => root.unmount());
  });

  it('indicates when enhancements are active', () => {
    runtime.state = setEnabled(createDefaultConfig(), true);
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container); act(() => root.render(<OpenAIChatShortcut />));
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Edit active OpenAI enhancements');
    act(() => root.unmount());
  });
});
