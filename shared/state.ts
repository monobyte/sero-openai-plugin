import { DEFAULT_SETTINGS, type EnhancementSettings, type OpenAIModelEnhancementConfig, type Verbosity } from './config';

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof EnhancementSettings)[];
const VERBOSITY = new Set<Verbosity>(['off', 'low', 'medium', 'high']);
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isSettingValue(key: keyof EnhancementSettings, value: unknown): boolean { return key === 'verbosity' ? typeof value === 'string' && VERBOSITY.has(value as Verbosity) : typeof value === 'boolean'; }

export function parseConfig(value: unknown): OpenAIModelEnhancementConfig {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.defaults) || !isRecord(value.models)) throw new Error('OpenAI enhancement state is malformed or uses an unsupported version.');
  const defaults = {} as EnhancementSettings;
  for (const key of SETTING_KEYS) {
    const setting = value.defaults[key];
    if (!isSettingValue(key, setting)) throw new Error(`OpenAI enhancement state has an invalid defaults.${key} value.`);
    Object.assign(defaults, { [key]: setting });
  }
  const models: OpenAIModelEnhancementConfig['models'] = {};
  for (const [key, model] of Object.entries(value.models)) {
    if (!isRecord(model) || typeof model.enabled !== 'boolean' || !isRecord(model.overrides)) throw new Error(`OpenAI enhancement state has an invalid model entry for ${key}.`);
    const overrides: Partial<EnhancementSettings> = {};
    for (const [settingKey, setting] of Object.entries(model.overrides)) {
      if (!SETTING_KEYS.includes(settingKey as keyof EnhancementSettings) || !isSettingValue(settingKey as keyof EnhancementSettings, setting)) throw new Error(`OpenAI enhancement state has an invalid ${key}.${settingKey} override.`);
      Object.assign(overrides, { [settingKey]: setting });
    }
    models[key] = { enabled: model.enabled, overrides };
  }
  return { version: 1, defaults, models };
}

export function effectiveSettings(config: OpenAIModelEnhancementConfig, key: string): EnhancementSettings | undefined {
  const model = config.models[key];
  return model?.enabled ? { ...config.defaults, ...model.overrides } : undefined;
}
export function setModelEnabled(config: OpenAIModelEnhancementConfig, key: string, enabled: boolean): OpenAIModelEnhancementConfig {
  const current = config.models[key] ?? { enabled: false, overrides: {} };
  return { ...config, models: { ...config.models, [key]: { ...current, enabled } } };
}
export function setDefault<K extends keyof EnhancementSettings>(config: OpenAIModelEnhancementConfig, key: K, value: EnhancementSettings[K]): OpenAIModelEnhancementConfig {
  const models = Object.fromEntries(Object.entries(config.models).map(([modelKey, model]) => {
    if (model.overrides[key] !== value) return [modelKey, model];
    const overrides = { ...model.overrides };
    delete overrides[key];
    return [modelKey, { ...model, overrides }];
  }));
  return { ...config, defaults: { ...config.defaults, [key]: value }, models };
}
export function setOverride<K extends keyof EnhancementSettings>(config: OpenAIModelEnhancementConfig, modelKey: string, key: K, value: EnhancementSettings[K]): OpenAIModelEnhancementConfig {
  const model = config.models[modelKey] ?? { enabled: false, overrides: {} };
  const overrides = { ...model.overrides };
  if (value === config.defaults[key]) delete overrides[key]; else Object.assign(overrides, { [key]: value });
  return { ...config, models: { ...config.models, [modelKey]: { ...model, overrides } } };
}
export function removeOverride(config: OpenAIModelEnhancementConfig, modelKey: string, key: keyof EnhancementSettings): OpenAIModelEnhancementConfig {
  const model = config.models[modelKey];
  if (!model || !(key in model.overrides)) return config;
  const overrides = { ...model.overrides }; delete overrides[key];
  return { ...config, models: { ...config.models, [modelKey]: { ...model, overrides } } };
}

function sameValue(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }

export function mergeDraft(
  currentValue: OpenAIModelEnhancementConfig,
  baseValue: OpenAIModelEnhancementConfig,
  draftValue: OpenAIModelEnhancementConfig,
): OpenAIModelEnhancementConfig {
  const current = parseConfig(currentValue); const base = parseConfig(baseValue); const draft = parseConfig(draftValue);
  let merged = current;
  for (const key of SETTING_KEYS) {
    if (sameValue(base.defaults[key], draft.defaults[key])) continue;
    if (!sameValue(current.defaults[key], base.defaults[key]) && !sameValue(current.defaults[key], draft.defaults[key])) throw new Error(`OpenAI settings changed elsewhere at defaults.${key}. Reset and try again.`);
    merged = { ...merged, defaults: { ...merged.defaults, [key]: draft.defaults[key] } };
  }
  const modelKeys = new Set([...Object.keys(base.models), ...Object.keys(draft.models)]);
  for (const modelKey of modelKeys) {
    const baseModel = base.models[modelKey] ?? { enabled: false, overrides: {} };
    const draftModel = draft.models[modelKey] ?? { enabled: false, overrides: {} };
    const currentModel = current.models[modelKey] ?? { enabled: false, overrides: {} };
    if (baseModel.enabled !== draftModel.enabled) {
      if (currentModel.enabled !== baseModel.enabled && currentModel.enabled !== draftModel.enabled) throw new Error(`OpenAI settings changed elsewhere at ${modelKey}.enabled. Reset and try again.`);
      merged = setModelEnabled(merged, modelKey, draftModel.enabled);
    }
    for (const key of SETTING_KEYS) {
      const baseOverride = baseModel.overrides[key]; const draftOverride = draftModel.overrides[key]; const currentOverride = currentModel.overrides[key];
      if (sameValue(baseOverride, draftOverride)) continue;
      if (!sameValue(currentOverride, baseOverride) && !sameValue(currentOverride, draftOverride)) throw new Error(`OpenAI settings changed elsewhere at ${modelKey}.${key}. Reset and try again.`);
      if (draftOverride === undefined) merged = removeOverride(merged, modelKey, key);
      else {
        const model = merged.models[modelKey] ?? { enabled: false, overrides: {} };
        merged = { ...merged, models: { ...merged.models, [modelKey]: { ...model, overrides: { ...model.overrides, [key]: draftOverride } } } };
      }
    }
  }
  return parseConfig(merged);
}
