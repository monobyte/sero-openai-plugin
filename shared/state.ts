import { DEFAULT_SETTINGS, type EnhancementSettings, type OpenAIModelEnhancementConfig, type Verbosity } from './config';

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof EnhancementSettings)[];
const VERBOSITY = new Set<Verbosity>(['off', 'low', 'medium', 'high']);
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isSettingValue(key: keyof EnhancementSettings, value: unknown): boolean { return key === 'verbosity' ? typeof value === 'string' && VERBOSITY.has(value as Verbosity) : typeof value === 'boolean'; }

export function parseConfig(value: unknown): OpenAIModelEnhancementConfig {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2) || !isRecord(value.defaults)) throw new Error('OpenAI enhancement state is malformed or uses an unsupported version.');
  const defaults = {} as EnhancementSettings;
  for (const key of SETTING_KEYS) {
    const setting = value.defaults[key];
    if (!isSettingValue(key, setting)) throw new Error(`OpenAI enhancement state has an invalid defaults.${key} value.`);
    Object.assign(defaults, { [key]: setting });
  }
  if (value.version === 2) {
    if (typeof value.enabled !== 'boolean') throw new Error('OpenAI enhancement state has an invalid enabled value.');
    return { version: 2, enabled: value.enabled, defaults };
  }
  if (!isRecord(value.models)) throw new Error('OpenAI enhancement state has an invalid models value.');
  const enabled = Object.values(value.models).some((model) => isRecord(model) && model.enabled === true);
  return { version: 2, enabled, defaults };
}

export function effectiveSettings(config: OpenAIModelEnhancementConfig): EnhancementSettings | undefined {
  return config.enabled ? { ...config.defaults } : undefined;
}
export function setEnabled(config: OpenAIModelEnhancementConfig, enabled: boolean): OpenAIModelEnhancementConfig {
  return { ...config, enabled };
}
export function setDefault<K extends keyof EnhancementSettings>(config: OpenAIModelEnhancementConfig, key: K, value: EnhancementSettings[K]): OpenAIModelEnhancementConfig {
  return { ...config, defaults: { ...config.defaults, [key]: value } };
}
