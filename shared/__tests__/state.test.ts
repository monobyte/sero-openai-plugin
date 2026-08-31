import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../config';
import { findCompatibility } from '../compatibility';
import { effectiveSettings, mergeDraft, parseConfig, removeOverride, setDefault, setModelEnabled, setOverride } from '../state';

describe('OpenAI enhancement configuration', () => {
  it('starts with every model disabled', () => { expect(createDefaultConfig().models).toEqual({}); });
  it('inherits provider defaults and stores only values that differ', () => {
    let config = setModelEnabled(createDefaultConfig(), 'openai/gpt-5.4', true);
    config = setOverride(config, 'openai/gpt-5.4', 'webTools', true);
    expect(effectiveSettings(config, 'openai/gpt-5.4')).toMatchObject({ promptAdaptation: true, webTools: true, fastMode: false });
    config = setOverride(config, 'openai/gpt-5.4', 'webTools', false);
    expect(config.models['openai/gpt-5.4'].overrides).toEqual({});
  });
  it('keeps an override when the provider default changes', () => {
    let config = setOverride(createDefaultConfig(), 'openai/gpt-4.1', 'verbosity', 'high');
    config = setDefault(config, 'verbosity', 'low');
    config = setModelEnabled(config, 'openai/gpt-4.1', true);
    expect(effectiveSettings(config, 'openai/gpt-4.1')?.verbosity).toBe('high');
  });
  it('removes an override when a provider default changes to the same value', () => {
    let config = setOverride(createDefaultConfig(), 'openai/gpt-5.4', 'webTools', true);
    config = setDefault(config, 'webTools', true);
    expect(config.models['openai/gpt-5.4'].overrides).toEqual({});
  });
  it('keeps overrides while disabled and removes one on restore', () => {
    let config = setOverride(createDefaultConfig(), 'openai/gpt-5.4', 'fastMode', true);
    expect(effectiveSettings(config, 'openai/gpt-5.4')).toBeUndefined();
    config = removeOverride(config, 'openai/gpt-5.4', 'fastMode');
    expect(config.models['openai/gpt-5.4'].overrides).toEqual({});
  });
  it('round-trips version 1 without materializing inherited values', () => {
    const config = setModelEnabled(createDefaultConfig(), 'openai/gpt-5.3-codex', true);
    expect(parseConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
    expect(config.models['openai/gpt-5.3-codex'].overrides).toEqual({});
  });
  it('rejects malformed and unsupported versions', () => {
    expect(() => parseConfig({ version: 2, defaults: {}, models: {} })).toThrow('unsupported version');
  });
  it('does not infer compatibility from model substrings or other routes', () => {
    expect(findCompatibility('openai', 'openai-responses', 'prefix-gpt-5.4')).toBeUndefined();
    expect(findCompatibility('openai-codex', 'openai-responses', 'gpt-5.4')).toBeUndefined();
    expect(findCompatibility('openai-codex', 'openai-codex-responses', 'gpt-5.4')?.key).toBe('openai-codex/gpt-5.4');
    expect(findCompatibility('openai', 'openai-responses', 'gpt-5.4')?.key).toBe('openai/gpt-5.4');
    expect(findCompatibility('openai-codex', 'openai-codex-responses', 'gpt-5.3-codex-spark')?.nativeImageInput).toBe(false);
  });
  it('keeps API-key and OAuth state independent for the same model ID', () => {
    let config = setModelEnabled(createDefaultConfig(), 'openai/gpt-5.4', true);
    config = setModelEnabled(config, 'openai-codex/gpt-5.4', true);
    config = setOverride(config, 'openai-codex/gpt-5.4', 'fastMode', true);
    expect(effectiveSettings(config, 'openai/gpt-5.4')?.fastMode).toBe(false);
    expect(effectiveSettings(config, 'openai-codex/gpt-5.4')?.fastMode).toBe(true);
    config = setModelEnabled(config, 'openai-codex/gpt-5.4', false);
    expect(effectiveSettings(config, 'openai/gpt-5.4')).toBeDefined(); expect(effectiveSettings(config, 'openai-codex/gpt-5.4')).toBeUndefined();
  });
  it('rebases independent draft changes and rejects same-setting conflicts', () => {
    const base = createDefaultConfig();
    const current = setDefault(base, 'webTools', true);
    const draft = setDefault(base, 'fastMode', true);
    expect(mergeDraft(current, base, draft).defaults).toMatchObject({ webTools: true, fastMode: true });
    expect(() => mergeDraft(setDefault(base, 'verbosity', 'low'), base, setDefault(base, 'verbosity', 'high'))).toThrow('changed elsewhere');
  });
});
