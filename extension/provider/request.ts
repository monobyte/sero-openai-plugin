import { convertResponsesMessages, convertResponsesTools } from '@earendil-works/pi-ai/api/openai-responses-shared';
import { clampThinkingLevel, type Context, type Tool } from '@earendil-works/pi-ai';
import { createGrammarToolInputProperties } from '@earendil-works/pi-ai/api/constrained-sampling';
import type { EnhancementSettings } from '../../shared/config';
import type { CodexModel, CodexOptions, CodexRequestBody } from './types';

const TOOL_PROVIDERS = new Set(['openai', 'openai-codex', 'opencode']);
function splitTools(context: Context, enabled: boolean): { immediate: Tool[]; deferred: Map<string, Tool> } {
  const tools = new Map((context.tools ?? []).map((tool) => [tool.name, tool]));
  if (!enabled) return { immediate: [...tools.values()], deferred: new Map() };
  const deferredNames = new Set<string>(); const used = new Set<string>();
  for (const message of context.messages) {
    if (message.role === 'assistant') for (const block of message.content) if (block.type === 'toolCall') used.add(block.name);
    if (message.role === 'toolResult') for (const name of message.addedToolNames ?? []) if (!used.has(name)) deferredNames.add(name);
  }
  return { immediate: [...tools].filter(([name]) => !deferredNames.has(name)).map(([, tool]) => tool), deferred: new Map([...tools].filter(([name]) => deferredNames.has(name))) };
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export async function buildFinalBody(model: CodexModel, context: Context, options: CodexOptions | undefined, settings: Readonly<EnhancementSettings>, sessionId?: string): Promise<CodexRequestBody> {
  const supportsOpenAIGrammarTools = model.compat?.supportsOpenAIGrammarTools ?? false;
  const grammarToolInputProperties = createGrammarToolInputProperties(context.tools, supportsOpenAIGrammarTools);
  const deferredMode = model.compat?.supportsAdditionalTools ? 'additional-tools' : model.compat?.supportsToolSearch ? 'tool-search' : undefined;
  const placement = splitTools(context, deferredMode !== undefined);
  const body: CodexRequestBody = {
    model: model.id, store: false, stream: true, instructions: context.systemPrompt || 'You are a helpful assistant.',
    input: convertResponsesMessages(model, context, TOOL_PROVIDERS, { includeSystemPrompt: false, grammarToolInputProperties, deferredTools: placement.deferred, deferredToolsMode: deferredMode, toolOptions: { strict: null, supportsStrictMode: model.compat?.supportsStrictMode ?? true, supportsOpenAIGrammarTools } }),
    include: ['reasoning.encrypted_content'], prompt_cache_key: sessionId, tool_choice: 'auto', parallel_tool_calls: true,
  };
  if (options?.temperature !== undefined) body.temperature = options.temperature;
  if (placement.immediate.length) body.tools = convertResponsesTools(placement.immediate, { strict: null, supportsStrictMode: model.compat?.supportsStrictMode ?? true, supportsOpenAIGrammarTools });
  if (options?.reasoning) {
    const clamped = clampThinkingLevel(model, options.reasoning);
    if (clamped !== 'off') {
      const effort = model.thinkingLevelMap?.[clamped] ?? clamped;
      if (effort !== null) body.reasoning = { effort, summary: 'auto' };
    }
  }
  if (settings.fastMode) body.service_tier = 'priority';
  if (settings.verbosity !== 'off') body.text = { verbosity: settings.verbosity };
  const replacement = await options?.onPayload?.(body, model);
  if (replacement === undefined) return body;
  if (!isRecord(replacement) || typeof replacement.model !== 'string' || !Array.isArray(replacement.input)) throw new Error('Provider request hook returned an invalid body.');
  return replacement as CodexRequestBody;
}
