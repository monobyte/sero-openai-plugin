import type {
  AppRuntime,
  AppRuntimeContext,
  AppRuntimeHost,
  AppRuntimeModule,
  AppRuntimeStateApi,
  AppRuntimeDevServer,
  AppRuntimeStartManagedDevServerResult,
  AppRuntimeWorkspaceRuntimeResolution,
} from '@sero-ai/common';
import type { KanbanState } from '../shared/types';

export type {
  AppRuntime,
  AppRuntimeContext,
  AppRuntimeHost,
  AppRuntimeModule,
  AppRuntimeStateApi,
  AppRuntimeDevServer,
  AppRuntimeStartManagedDevServerResult,
  AppRuntimeWorkspaceRuntimeResolution,
} from '@sero-ai/common';

export type KanbanRuntimeState = KanbanState;

/**
 * Plugin-local alias for the generic host capability bag.
 *
 * Keep runtime code typed against this interface so later Kanban-specific
 * capability refinements stay local to `runtime/` without reaching for
 * desktop-internal imports.
 */
export interface KanbanRuntimeHost extends AppRuntimeHost {}

export interface KanbanRuntimeContext extends AppRuntimeContext {
  host: KanbanRuntimeHost;
}
