import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../config';
import { findCompatibility } from '../compatibility';
import { effectiveSettings, parseConfig, setDefault, setEnabled } from '../state';

describe('OpenAI enhancement configuration', () => {
  it('starts globally disabled', () => {
    expect(createDefaultConfig()).toMatchObject({ version: 2, enabled: false });
    expect(effectiveSettings(createDefaultConfig())).toBeUndefined();
  });

  it('applies one default set whenever enhancements are enabled', () => {
    let config = setEnabled(createDefaultConfig(), true);
    config = setDefault(config, 'webTools', true);
    config = setDefault(config, 'verbosity', 'high');
    expect(effectiveSettings(config)).toMatchObject({ promptAdaptation: true, webTools: true, verbosity: 'high' });
  });

  it('migrates version 1 state to the global switch and removes model overrides', () => {
    const migrated = parseConfig({
      version: 1,
      defaults: createDefaultConfig().defaults,
      models: {
        'openai/gpt-5.4': { enabled: false, overrides: { fastMode: true } },
        'openai-codex/gpt-5.6-luna': { enabled: true, overrides: { verbosity: 'high' } },
      },
    });
    expect(migrated).toEqual({ version: 2, enabled: true, defaults: createDefaultConfig().defaults });
    expect(parseConfig({ version: 1, defaults: createDefaultConfig().defaults, models: {} }).enabled).toBe(false);
  });

  it('round-trips version 2 and rejects malformed or unsupported state', () => {
    const config = setEnabled(createDefaultConfig(), true);
    expect(parseConfig(structuredClone(config))).toEqual(config);
    expect(() => parseConfig({ version: 3, enabled: true, defaults: config.defaults })).toThrow('unsupported version');
    expect(() => parseConfig({ version: 2, enabled: 'yes', defaults: config.defaults })).toThrow('invalid enabled');
  });

  it('does not infer compatibility from model substrings or other routes', () => {
    expect(findCompatibility('openai', 'openai-responses', 'prefix-gpt-5.4')).toBeUndefined();
    expect(findCompatibility('openai-codex', 'openai-responses', 'gpt-5.4')).toBeUndefined();
    expect(findCompatibility('openai-codex', 'openai-codex-responses', 'gpt-5.4')?.key).toBe('openai-codex/gpt-5.4');
    expect(findCompatibility('openai', 'openai-responses', 'gpt-5.4')?.key).toBe('openai/gpt-5.4');
    expect(findCompatibility('openai-codex', 'openai-codex-responses', 'gpt-5.3-codex-spark')?.nativeImageInput).toBe(false);
  });

});
