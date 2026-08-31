import type { Usage } from '@earendil-works/pi-ai';
import type { CodexModel } from './types';
import type { ServiceTier } from './types';
export function resolveTier(response: ServiceTier | undefined, requested: ServiceTier | undefined): ServiceTier | undefined { return response === 'default' && (requested === 'priority' || requested === 'flex') ? requested : response ?? requested; }
export function applyTierCost(usage: Usage, tier: unknown, model: CodexModel, routedModelId = model.id): void {
  const multiplier = tier === 'priority' ? routedModelId === 'gpt-5.5' ? 2.5 : 2 : tier === 'flex' ? 0.5 : 1;
  if (multiplier === 1) return;
  usage.cost.input *= multiplier; usage.cost.output *= multiplier; usage.cost.cacheRead *= multiplier; usage.cost.cacheWrite *= multiplier;
  usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
}
