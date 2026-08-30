import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ExtensionSessionRuntime } from '@sero-ai/common';

export type KanbanSessionRuntime = ExtensionSessionRuntime;

type RuntimeAwareExtensionContext = ExtensionContext & {
  sessionRuntime?: KanbanSessionRuntime;
};

export function createKanbanSessionRuntime(
  api: Pick<ExtensionAPI, 'sendUserMessage' | 'sendMessage'>,
): KanbanSessionRuntime {
  return {
    sendUserMessage: (content, options) => api.sendUserMessage(content, options),
    sendMessage: (message, options) => api.sendMessage(message, options),
  };
}

export function getKanbanSessionRuntime(
  ctx: ExtensionContext | undefined,
): KanbanSessionRuntime | undefined {
  return (ctx as RuntimeAwareExtensionContext | undefined)?.sessionRuntime;
}
