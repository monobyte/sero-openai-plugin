import type { AppRuntimeWorktreeCreateResult } from '@sero-ai/common';
import type { KanbanRuntimeHost } from '../types';
import type { Card } from './types';

const WORKTREE_CREATE_RECOVERY_PATTERNS = [
  'missing but already registered worktree',
  'use add -f to override, or prune or remove to clear',
  "' already exists",
];

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isStaleWorktreeRegistrationError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return WORKTREE_CREATE_RECOVERY_PATTERNS.some((pattern) => message.includes(pattern));
}

async function clearStaleRegistration(
  host: Pick<KanbanRuntimeHost, 'git'>,
  workspacePath: string,
  cardId: string,
): Promise<void> {
  await host.git.removeWorktree(workspacePath, cardId, { force: true });
}

export async function createWorktreeWithRecovery(
  host: Pick<KanbanRuntimeHost, 'git'>,
  workspacePath: string,
  card: Pick<Card, 'id' | 'title'>,
): Promise<AppRuntimeWorktreeCreateResult> {
  try {
    return await host.git.createWorktree(workspacePath, card.id, card.title);
  } catch (error) {
    if (!isStaleWorktreeRegistrationError(error)) {
      throw error;
    }

    console.warn(
      `[kanban-runtime] Recovering stale git worktree for card #${card.id}: ${errorMessage(error)}`,
    );
    await clearStaleRegistration(host, workspacePath, card.id);

    try {
      return await host.git.createWorktree(workspacePath, card.id, card.title);
    } catch (retryError) {
      throw new Error(
        `Recovered stale worktree for card #${card.id}, but worktree creation still failed: ${errorMessage(retryError)}`,
      );
    }
  }
}
