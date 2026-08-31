import type { Api, Model } from '@earendil-works/pi-ai';
import type { EnhancementSettings, OpenAIModelEnhancementConfig } from '../shared/config';
import { findCompatibility, type OpenAICompatibilityRecord } from '../shared/compatibility';
import { effectiveSettings } from '../shared/state';

export const OWNED_TOOLS = ['openai_extender_web_search', 'openai_extender_read_page', 'openai_extender_image', 'openai_extender_describe_image', 'openai_extender_settings'] as const;
export const ADAPTED_PROMPT = 'OpenAI model enhancements are active. Preserve Sero project instructions, skills, and active-tool guidance.';

export interface ActiveEnhancement { compatibility: OpenAICompatibilityRecord; settings: EnhancementSettings }
export function resolveActive(config: OpenAIModelEnhancementConfig, model: Model<Api> | undefined): ActiveEnhancement | undefined {
  if (!model) return undefined;
  const compatibility = findCompatibility(model.provider, model.api, model.id);
  if (!compatibility) return undefined;
  const settings = effectiveSettings(config);
  return settings ? { compatibility, settings } : undefined;
}
export function desiredTools(active: ActiveEnhancement | undefined): string[] {
  if (!active) return [];
  return [
    ...(active.settings.webTools ? OWNED_TOOLS.slice(0, 2) : []),
    ...(active.settings.imageGeneration ? [OWNED_TOOLS[2]] : []),
    ...(active.settings.imageFallback && !active.compatibility.nativeImageInput ? [OWNED_TOOLS[3]] : []),
  ];
}
export function reconcileTools(current: readonly string[], desired: readonly string[]): string[] {
  const owned = new Set<string>(OWNED_TOOLS);
  return [...current.filter((name) => !owned.has(name)), ...new Set(desired)];
}
export function adaptSystemPrompt(systemPrompt: string, active: ActiveEnhancement | undefined): string {
  if (!active?.settings.promptAdaptation) return systemPrompt;
  const guidance = [
    ADAPTED_PROMPT,
    active.settings.webTools ? 'Use the plugin web tools for current information and keep source URLs in the answer.' : null,
    active.settings.imageGeneration ? 'Use the image tool only when the user asks to create or edit an image.' : null,
  ].filter((line): line is string => line !== null);
  return `${systemPrompt}\n\n${guidance.join('\n')}`;
}
export function rewriteProviderPayload<T>(payload: T, active: ActiveEnhancement | undefined): T {
  if (!active || typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload;
  const source = payload as Record<string, unknown>;
  if (!active.settings.fastMode && active.settings.verbosity === 'off') return payload;
  const result: Record<string, unknown> = { ...source };
  if (active.settings.fastMode) result.service_tier = 'priority';
  if (active.settings.verbosity !== 'off') {
    const text = typeof source.text === 'object' && source.text !== null && !Array.isArray(source.text) ? source.text as Record<string, unknown> : {};
    result.text = { ...text, verbosity: active.settings.verbosity };
  }
  return result as T;
}
