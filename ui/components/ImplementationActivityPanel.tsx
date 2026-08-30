/**
 * ImplementationActivityPanel — live progress feed for the implementation phase.
 *
 * Wraps ActivityPanel with the Kanban accent theme, adds a progress bar and optional stage indicator.
 */

import { motion } from 'motion/react';
import type { Card, ImplementationProgress } from '../../shared/types';
import { ActivityPanel, type ActivityPanelTheme } from './ActivityPanel';

const THEME: ActivityPanelTheme = {
  primary: 'var(--kb-accent)',
  primaryText: 'var(--kb-accent)',
  border: 'var(--kb-accent-border)',
  background: 'var(--kb-accent-glow)',
  agentRunningBg: 'var(--kb-accent-glow)',
};

export function ImplementationActivityPanel({
  card,
  progress,
}: {
  card: Card;
  progress?: ImplementationProgress;
}) {
  const completedCount = card.subtasks.filter((s) => s.status === 'completed').length;
  const totalCount = card.subtasks.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <ActivityPanel
      theme={THEME}
      data={progress}
      defaultPhase="Implementing…"
      fallbackText="Executing the implementation plan with a single agent."
      headerSlot={
        <>
          {/* Overall progress bar */}
          <div style={{ height: '3px', backgroundColor: 'var(--kb-accent-glow)' }}>
            <motion.div
              style={{ height: '100%', backgroundColor: 'var(--kb-accent)', borderRadius: '0 2px 2px 0' }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          {/* Optional stage indicator */}
          {progress && progress.totalWaves > 0 && (
            <WaveIndicator currentWave={progress.currentWave} totalWaves={progress.totalWaves} />
          )}
        </>
      }
      headerExtra={
        <span style={{ fontSize: '10px', color: 'var(--kb-accent)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
          {completedCount}/{totalCount}
        </span>
      }
    />
  );
}

function WaveIndicator({ currentWave, totalWaves }: { currentWave: number; totalWaves: number }) {
  return (
    <div style={{ padding: '0 14px 8px' }}>
      <div className="flex" style={{ gap: '3px' }}>
        {Array.from({ length: totalWaves }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: '4px',
              borderRadius: '2px',
              backgroundColor:
                i + 1 < currentWave
                  ? '#34d399'
                  : i + 1 === currentWave
                    ? 'var(--kb-accent)'
                    : 'rgba(255, 255, 255, 0.06)',
              transition: 'background-color 0.3s',
            }}
          />
        ))}
      </div>
    </div>
  );
}
