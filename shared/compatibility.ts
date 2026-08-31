export interface OpenAICompatibilityRecord {
  key: string; provider: 'openai' | 'openai-codex'; api: 'openai-responses' | 'openai-codex-responses'; modelId: string; displayName: string; nativeImageInput: boolean;
}
export const OPENAI_COMPATIBILITY: readonly OpenAICompatibilityRecord[] = Object.freeze([
  { key: 'openai/gpt-5.4', provider: 'openai', api: 'openai-responses', modelId: 'gpt-5.4', displayName: 'GPT-5.4', nativeImageInput: true },
  { key: 'openai/gpt-5.3-codex', provider: 'openai', api: 'openai-responses', modelId: 'gpt-5.3-codex', displayName: 'GPT-5.3 Codex', nativeImageInput: true },
  { key: 'openai/gpt-4.1', provider: 'openai', api: 'openai-responses', modelId: 'gpt-4.1', displayName: 'GPT-4.1', nativeImageInput: true },
  { key: 'openai-codex/gpt-5.3-codex-spark', provider: 'openai-codex', api: 'openai-codex-responses', modelId: 'gpt-5.3-codex-spark', displayName: 'GPT-5.3 Codex Spark (OAuth)', nativeImageInput: false },
  { key: 'openai-codex/gpt-5.4', provider: 'openai-codex', api: 'openai-codex-responses', modelId: 'gpt-5.4', displayName: 'GPT-5.4 (OAuth)', nativeImageInput: true },
  { key: 'openai-codex/gpt-5.4-mini', provider: 'openai-codex', api: 'openai-codex-responses', modelId: 'gpt-5.4-mini', displayName: 'GPT-5.4 Mini (OAuth)', nativeImageInput: true },
  { key: 'openai-codex/gpt-5.5', provider: 'openai-codex', api: 'openai-codex-responses', modelId: 'gpt-5.5', displayName: 'GPT-5.5 (OAuth)', nativeImageInput: true },
  { key: 'openai-codex/gpt-5.6-luna', provider: 'openai-codex', api: 'openai-codex-responses', modelId: 'gpt-5.6-luna', displayName: 'GPT-5.6 Luna (OAuth)', nativeImageInput: true },
  { key: 'openai-codex/gpt-5.6-sol', provider: 'openai-codex', api: 'openai-codex-responses', modelId: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol (OAuth)', nativeImageInput: true },
  { key: 'openai-codex/gpt-5.6-terra', provider: 'openai-codex', api: 'openai-codex-responses', modelId: 'gpt-5.6-terra', displayName: 'GPT-5.6 Terra (OAuth)', nativeImageInput: true },
]);
export function modelKey(provider: string, modelId: string): string { return `${provider}/${modelId}`; }
export function findCompatibility(provider: string, api: string, modelId: string): OpenAICompatibilityRecord | undefined {
  return OPENAI_COMPATIBILITY.find((entry) => entry.provider === provider && entry.api === api && entry.modelId === modelId);
}
