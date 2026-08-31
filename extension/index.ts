import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { OpenAIModelEnhancementConfig } from '../shared/config';
import { adaptSystemPrompt, desiredTools, reconcileTools, resolveActive, rewriteProviderPayload } from './behavior';
import { readConfig, resolveStatePath } from './state-io';
import { registerOwnedTools } from './tools';

export default function openAIExtender(pi: ExtensionAPI): void {
  let config: OpenAIModelEnhancementConfig | undefined;
  const reload = async (): Promise<void> => { config = await readConfig(resolveStatePath()); };
  const active = (model: Parameters<typeof resolveActive>[1], usingOAuth = false) => usingOAuth || !config ? undefined : resolveActive(config, model);
  const reconcile = (model: Parameters<typeof resolveActive>[1], usingOAuth = false) => pi.setActiveTools(reconcileTools(pi.getActiveTools(), desiredTools(active(model, usingOAuth))));

  registerOwnedTools(pi);
  pi.on('session_start', async (_event, ctx) => {
    try { await reload(); reconcile(ctx.model, Boolean(ctx.model && ctx.modelRegistry.isUsingOAuth(ctx.model))); }
    catch (error) { ctx.ui.notify(error instanceof Error ? error.message : 'OpenAI enhancement state could not be loaded.', 'warning'); reconcile(undefined); }
  });
  pi.on('model_select', async (event, ctx) => {
    try { await reload(); reconcile(event.model, ctx.modelRegistry.isUsingOAuth(event.model)); }
    catch (error) { ctx.ui.notify(error instanceof Error ? error.message : 'OpenAI enhancement state could not be loaded.', 'warning'); reconcile(undefined); }
  });
  pi.on('before_agent_start', async (event, ctx) => {
    try { await reload(); reconcile(ctx.model, Boolean(ctx.model && ctx.modelRegistry.isUsingOAuth(ctx.model))); }
    catch { config = undefined; reconcile(undefined); return; }
    const nextPrompt = adaptSystemPrompt(event.systemPrompt, active(ctx.model, Boolean(ctx.model && ctx.modelRegistry.isUsingOAuth(ctx.model))));
    if (nextPrompt !== event.systemPrompt) return { systemPrompt: nextPrompt };
  });
  pi.on('before_provider_request', (event, ctx) => rewriteProviderPayload(event.payload, active(ctx.model, Boolean(ctx.model && ctx.modelRegistry.isUsingOAuth(ctx.model)))));
  pi.on('session_shutdown', () => { config = undefined; });
}
