export type Verbosity = 'off' | 'low' | 'medium' | 'high';
export interface EnhancementSettings { promptAdaptation: boolean; webTools: boolean; imageGeneration: boolean; imageFallback: boolean; fastMode: boolean; verbosity: Verbosity }
export interface OpenAIModelEnhancementConfig { version: 2; enabled: boolean; defaults: EnhancementSettings }

export const DEFAULT_SETTINGS: EnhancementSettings = Object.freeze({ promptAdaptation: true, webTools: false, imageGeneration: false, imageFallback: true, fastMode: false, verbosity: 'off' });
export const DEFAULT_CONFIG: OpenAIModelEnhancementConfig = Object.freeze({ version: 2, enabled: false, defaults: DEFAULT_SETTINGS });
export function createDefaultConfig(): OpenAIModelEnhancementConfig { return { version: 2, enabled: false, defaults: { ...DEFAULT_SETTINGS } }; }
