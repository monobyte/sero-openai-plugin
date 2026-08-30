/**
 * Shared Kanban plugin contracts.
 *
 * Keep this module renderer-safe and framework-agnostic.
 */

export type Column = 'backlog' | 'planning' | 'in-progress' | 'review' | 'done';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type CardStatus = 'idle' | 'agent-working' | 'waiting-input' | 'paused' | 'failed';
export type ReviewMode = 'full' | 'light';

export interface Subtask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  dependsOn: string[];
  /** TDD scenario designation: 'tdd' = write tests first, 'test-after' = tests after, 'no-test' = skip */
  tddDesignation?: 'tdd' | 'test-after' | 'no-test';
  /** File paths this subtask creates or modifies */
  filePaths?: string[];
  /** Estimated complexity: low (~15min), medium (~30min), high (~45min+) */
  complexity?: 'low' | 'medium' | 'high';
  /** Spec review status (per-subtask review mode) */
  specReviewStatus?: 'pending' | 'passed' | 'failed';
  /** Quality review status (per-subtask review mode) */
  qualityReviewStatus?: 'pending' | 'passed' | 'failed';
  agentRunId?: string;
  checkpointId?: string;
}

export interface PlanningToolEntry {
  tool: string;
  args: string;
  running: boolean;
}

export interface PlanningProgress {
  phase: string;
  startedAt: number;
  agents: { name: string; status: 'running' | 'completed' | 'failed' }[];
  recentTools: PlanningToolEntry[];
  log: string[];
  liveOutput?: string;
  liveOutputSource?: string;
}

export interface ImplementationProgress {
  phase: string;
  startedAt: number;
  currentWave: number;
  totalWaves: number;
  agents: { name: string; status: 'running' | 'completed' | 'failed' }[];
  recentTools: PlanningToolEntry[];
  log: string[];
  liveOutput?: string;
  liveOutputSource?: string;
}

export interface ReviewProgress {
  phase: string;
  startedAt: number;
  agents: { name: string; status: 'running' | 'completed' | 'failed' }[];
  recentTools: PlanningToolEntry[];
  log: string[];
  liveOutput?: string;
  liveOutputSource?: string;
}

export interface Card {
  id: string;
  title: string;
  description: string;
  acceptance: string[];
  priority: Priority;
  column: Column;
  status: CardStatus;
  /** IDs of cards that must be in 'done' before this card can start */
  blockedBy?: string[];
  branch?: string;
  worktreePath?: string;
  sessionId?: string;
  subtasks: Subtask[];
  plan?: string;
  prUrl?: string;
  prNumber?: number;
  previewUrl?: string;
  previewServerId?: string;
  reviewFilePath?: string;
  lastCheckpoint?: string;
  planningProgress?: PlanningProgress;
  implementationProgress?: ImplementationProgress;
  reviewProgress?: ReviewProgress;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface KanbanSettings {
  autoAdvance: boolean;
  /** Review style: full diff review, or light smoke review for prototype work */
  reviewMode: ReviewMode;
  /** Whether TDD and testing are enabled (default: true). false = POC mode */
  testingEnabled: boolean;
  /** YOLO mode: auto-start, auto-approve, auto-complete — no human gates */
  yoloMode: boolean;
  /** When YOLO mode is enabled, automatically request GitHub PR auto-merge. */
  yoloAutoMergePrs: boolean;
}

export interface KanbanState {
  cards: Card[];
  nextId: number;
  settings: KanbanSettings;
}

export type PartialKanbanState = Omit<Partial<KanbanState>, 'settings'> & {
  settings?: Partial<KanbanSettings>;
};

export const COLUMNS: Column[] = ['backlog', 'planning', 'in-progress', 'review', 'done'];

export const COLUMN_LABELS: Record<Column, string> = {
  backlog: 'Backlog',
  planning: 'Planning',
  'in-progress': 'In Progress',
  review: 'Review',
  done: 'Done',
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function createDefaultKanbanState(): KanbanState {
  return {
    cards: [],
    nextId: 1,
    settings: {
      autoAdvance: true,
      reviewMode: 'full',
      testingEnabled: true,
      yoloMode: false,
      yoloAutoMergePrs: false,
    },
  };
}

export const DEFAULT_KANBAN_STATE: KanbanState = createDefaultKanbanState();

function getNextCardId(cards: Card[]): number {
  const maxId = cards.reduce((max, card) => {
    const numericId = Number.parseInt(card.id, 10);
    return Number.isFinite(numericId) ? Math.max(max, numericId) : max;
  }, 0);
  return maxId + 1;
}

export function normalizeKanbanState(state: PartialKanbanState | null | undefined): KanbanState {
  const defaults = createDefaultKanbanState();
  const cards = Array.isArray(state?.cards) ? state.cards : defaults.cards;
  const nextId = typeof state?.nextId === 'number' && Number.isFinite(state.nextId) && state.nextId > 0
    ? state.nextId
    : getNextCardId(cards);

  return {
    cards,
    nextId,
    settings: {
      ...defaults.settings,
      ...state?.settings,
    },
  };
}

export function createCard(
  id: string,
  title: string,
  opts?: Partial<Pick<Card, 'description' | 'priority' | 'acceptance' | 'blockedBy'>>,
): Card {
  const now = new Date().toISOString();
  return {
    id,
    title,
    description: opts?.description ?? '',
    acceptance: opts?.acceptance ?? [],
    priority: opts?.priority ?? 'medium',
    column: 'backlog',
    status: 'idle',
    blockedBy: opts?.blockedBy ?? [],
    subtasks: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ── Error reporting ─────────────────────────────────────────

export type ErrorSeverity = 'error' | 'warning' | 'test-failure';

export interface ErrorReport {
  /** Unique error ID */
  id: string;
  /** Card ID this error relates to */
  cardId: string;
  /** Card title at the time of the error */
  cardTitle: string;
  /** Which phase the error occurred in */
  phase: 'planning' | 'implementation' | 'review';
  /** Name of the subagent that reported the error */
  agentName: string;
  /** Error severity */
  severity: ErrorSeverity;
  /** Short summary of the error */
  message: string;
  /** Full error details (stack traces, test output, etc.) */
  details?: string;
  /** File paths involved, if any */
  filePaths?: string[];
  /** ISO timestamp */
  timestamp: string;
}

export interface ErrorLog {
  errors: ErrorReport[];
  /** ISO timestamp of last retrospective run */
  lastRetrospectiveAt?: string;
}

export const DEFAULT_ERROR_LOG: ErrorLog = {
  errors: [],
};
