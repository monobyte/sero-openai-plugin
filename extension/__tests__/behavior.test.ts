import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../shared/config';
import { setModelEnabled, setOverride } from '../../shared/state';
import { adaptSystemPrompt, desiredTools, reconcileTools, resolveActive, rewriteProviderPayload } from '../behavior';

const model = (provider = 'openai', id = 'gpt-5.4', api = 'openai-responses') => ({ provider, id, api }) as never;
function active(fastMode: boolean, verbosity: 'off' | 'low' | 'medium' | 'high') {
  let config = setModelEnabled(createDefaultConfig(), 'openai/gpt-5.4', true);
  config = setOverride(config, 'openai/gpt-5.4', 'fastMode', fastMode);
  config = setOverride(config, 'openai/gpt-5.4', 'verbosity', verbosity);
  return resolveActive(config, model())!;
}

describe('extension behavior', () => {
  it('does nothing for disabled, unsupported, and Codex OAuth routes', () => {
    expect(resolveActive(createDefaultConfig(), model())).toBeUndefined();
    expect(resolveActive(setModelEnabled(createDefaultConfig(), 'openai/gpt-5.4', true), model('openai-codex', 'gpt-5.4', 'openai-codex-responses'))).toBeUndefined();
  });
  it('appends prompt guidance without replacing existing context', () => {
    const value = adaptSystemPrompt('Sero context\nOther extension', active(false, 'off'));
    expect(value).toContain('Sero context\nOther extension');
    expect(value).toContain('OpenAI model enhancements are active');
    expect(value).not.toContain('web tools');
  });
  it('reconciles owned tools without removing another extension tools', () => {
    expect(reconcileTools(['read', 'other_tool', 'openai_extender_web_search'], ['openai_extender_image'])).toEqual(['read', 'other_tool', 'openai_extender_image']);
    expect(reconcileTools(['read', 'openai_extender_web_search'], ['openai_extender_web_search'])).toEqual(['read', 'openai_extender_web_search']);
    expect(reconcileTools(['read', 'openai_extender_settings'], [])).toEqual(['read']);
  });
  it('uses fallback only when native image input is unavailable', () => {
    const native = active(false, 'off');
    expect(desiredTools(native)).not.toContain('openai_extender_describe_image');
    const textOnly = { ...native, compatibility: { ...native.compatibility, nativeImageInput: false } };
    expect(desiredTools(textOnly)).toContain('openai_extender_describe_image');
  });
  it('activates independent tool groups', () => {
    let config = setModelEnabled(createDefaultConfig(), 'openai/gpt-5.4', true);
    config = setOverride(config, 'openai/gpt-5.4', 'webTools', true);
    expect(desiredTools(resolveActive(config, model()))).toEqual(['openai_extender_web_search', 'openai_extender_read_page']);
  });
  for (const verbosity of ['off', 'low', 'medium', 'high'] as const) for (const fast of [false, true]) {
    it(`rewrites immutably with fast=${fast} and verbosity=${verbosity}`, () => {
      const payload = { input: 'kept', text: { format: 'plain' }, synthetic: 1 };
      const rewritten = rewriteProviderPayload(payload, active(fast, verbosity)) as Record<string, unknown>;
      expect(payload).toEqual({ input: 'kept', text: { format: 'plain' }, synthetic: 1 });
      expect(rewritten.input).toBe('kept'); expect(rewritten.synthetic).toBe(1);
      expect(rewritten.service_tier).toBe(fast ? 'priority' : undefined);
      expect((rewritten.text as Record<string, unknown>).verbosity).toBe(verbosity === 'off' ? undefined : verbosity);
      expect((rewritten.text as Record<string, unknown>).format).toBe('plain');
    });
  }
  it('returns an unmodified payload when neither request setting is owned', () => {
    const payload = { text: { verbosity: 'synthetic-extension' }, service_tier: 'synthetic' };
    expect(rewriteProviderPayload(payload, active(false, 'off'))).toBe(payload);
  });
});
