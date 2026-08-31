export interface OpenAICompatibilityRecord {
  key: string; provider: 'openai'; api: 'openai-responses'; modelId: 'gpt-5.4' | 'gpt-5.3-codex' | 'gpt-4.1'; displayName: string; nativeImageInput: boolean;
}
export const OPENAI_COMPATIBILITY: readonly OpenAICompatibilityRecord[] = Object.freeze([
  { key: 'openai/gpt-5.4', provider: 'openai', api: 'openai-responses', modelId: 'gpt-5.4', displayName: 'GPT-5.4', nativeImageInput: true },
  { key: 'openai/gpt-5.3-codex', provider: 'openai', api: 'openai-responses', modelId: 'gpt-5.3-codex', displayName: 'GPT-5.3 Codex', nativeImageInput: true },
  { key: 'openai/gpt-4.1', provider: 'openai', api: 'openai-responses', modelId: 'gpt-4.1', displayName: 'GPT-4.1', nativeImageInput: true },
]);
export function modelKey(provider: string, modelId: string): string { return `${provider}/${modelId}`; }
export function findCompatibility(provider: string, api: string, modelId: string): OpenAICompatibilityRecord | undefined {
  return OPENAI_COMPATIBILITY.find((entry) => entry.provider === provider && entry.api === api && entry.modelId === modelId);
}
