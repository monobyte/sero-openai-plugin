export type Verbosity = 'off' | 'low' | 'medium' | 'high';
export interface EnhancementSettings { promptAdaptation: boolean; webTools: boolean; imageGeneration: boolean; imageFallback: boolean; fastMode: boolean; verbosity: Verbosity }
export interface ModelEnhancementConfig { enabled: boolean; overrides: Partial<EnhancementSettings> }
export interface OpenAIModelEnhancementConfig { version: 1; defaults: EnhancementSettings; models: Record<string, ModelEnhancementConfig> }

export const DEFAULT_SETTINGS: EnhancementSettings = Object.freeze({ promptAdaptation: true, webTools: false, imageGeneration: false, imageFallback: true, fastMode: false, verbosity: 'off' });
export const DEFAULT_CONFIG: OpenAIModelEnhancementConfig = Object.freeze({ version: 1, defaults: DEFAULT_SETTINGS, models: {} });
export function createDefaultConfig(): OpenAIModelEnhancementConfig { return { version: 1, defaults: { ...DEFAULT_SETTINGS }, models: {} }; }
