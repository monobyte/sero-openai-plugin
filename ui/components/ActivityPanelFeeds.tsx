import type { PlanningToolEntry } from '../../shared/types';
import { formatActivityLogLine } from './activity-panel-log';
import type { ActivityPanelTheme } from './ActivityPanel';

type ToolIconName = 'file' | 'terminal' | 'pencil' | 'folder' | 'search' | 'wrench';

const TOOL_ICONS: Record<string, ToolIconName> = {
  read: 'file',
  bash: 'terminal',
  write: 'pencil',
  edit: 'pencil',
  ls: 'folder',
  find: 'search',
  grep: 'search',
  glob: 'search',
};

function resolveToolIcon(name: string): ToolIconName {
  return TOOL_ICONS[name] ?? 'wrench';
}

function ToolIcon({ name }: { name: string }) {
  const icon = resolveToolIcon(name);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: '12px', height: '12px', display: 'block' }}
      aria-hidden="true"
    >
      {icon === 'file' && (
        <>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M10 9H8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </>
      )}
      {icon === 'terminal' && (
        <>
          <path d="m7 11 3-3-3-3" />
          <path d="M11 13h4" />
          <rect width="18" height="14" x="3" y="5" rx="2" />
        </>
      )}
      {icon === 'pencil' && (
        <>
          <path d="M21.17 6.83a2.83 2.83 0 0 0-4-4L3 17v4h4Z" />
          <path d="m15 5 4 4" />
        </>
      )}
      {icon === 'folder' && (
        <>
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </>
      )}
      {icon === 'search' && (
        <>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </>
      )}
      {icon === 'wrench' && (
        <>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.9 7.9l-6 6a2.1 2.1 0 0 1-3-3l6-6a6 6 0 0 1 7.9-7.9Z" />
        </>
      )}
    </svg>
  );
}

export function ToolFeed({
  feedRef,
  tools,
  activeColor,
  maxHeight,
  separated,
}: {
  feedRef: React.RefObject<HTMLDivElement | null>;
  tools: PlanningToolEntry[];
  activeColor: string;
  maxHeight: number;
  separated: boolean;
}) {
  return (
    <div
      ref={feedRef}
      style={{
        maxHeight: `${maxHeight}px`,
        overflowY: 'auto',
        marginTop: separated ? '8px' : 0,
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        padding: separated ? '10px 14px 6px' : '6px 14px',
      }}
      className="kb-scrollbar"
    >
      {tools.map((entry, index) => (
        <div
          key={`${entry.tool}-${index}`}
          className="flex items-center"
          style={{ gap: '6px', padding: '2px 0' }}
        >
          <span
            style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: entry.running ? activeColor : '#34d399',
              animation: entry.running ? 'kb-pulse 1.5s ease-in-out infinite' : undefined,
              flexShrink: 0,
            }}
          />
          <span style={{ color: '#a1a1aa', flexShrink: 0 }}>
            <ToolIcon name={entry.tool} />
          </span>
          <span style={{ fontSize: '10px', fontWeight: 500, color: '#5c5e6a', flexShrink: 0 }}>
            {entry.tool}
          </span>
          {entry.args && (
            <span
              style={{
                fontSize: '10px',
                color: 'rgba(139, 141, 151, 0.6)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {entry.args}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function NarrativeFeed({
  feedRef,
  entries,
  theme,
  maxHeight,
  separated,
}: {
  feedRef: React.RefObject<HTMLDivElement | null>;
  entries: string[];
  theme: ActivityPanelTheme;
  maxHeight: number;
  separated: boolean;
}) {
  return (
    <div
      ref={feedRef}
      style={{
        maxHeight: `${maxHeight}px`,
        overflowY: 'auto',
        marginTop: separated ? '8px' : 0,
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        padding: separated ? '10px 14px 4px' : '8px 14px 2px',
      }}
      className="kb-scrollbar"
    >
      {entries.map((entry, index) => (
        <NarrativeEntry key={`${entry}-${index}`} entry={entry} theme={theme} />
      ))}
    </div>
  );
}

function NarrativeEntry({
  entry,
  theme,
}: {
  entry: string;
  theme: ActivityPanelTheme;
}) {
  const formattedEntry = formatActivityLogLine(entry);
  const tone = resolveLogTone(formattedEntry);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '0 0 6px',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: tone === 'running'
            ? theme.primary
            : tone === 'success'
              ? '#34d399'
              : tone === 'error'
                ? '#f87171'
                : tone === 'warning'
                  ? '#f59e0b'
                  : 'rgba(255, 255, 255, 0.18)',
          animation: tone === 'running' ? 'kb-pulse 1.8s ease-in-out infinite' : undefined,
          flexShrink: 0,
          marginTop: '4px',
        }}
      />
      <p
        className="whitespace-pre-wrap break-words"
        style={{
          fontSize: '10px',
          lineHeight: 1.45,
          color: tone === 'success'
            ? '#86efac'
            : tone === 'error'
              ? '#fca5a5'
              : tone === 'warning'
                ? '#fcd34d'
                : tone === 'running'
                  ? theme.primaryText
                  : '#8b8d97',
          minWidth: 0,
        }}
      >
        {formattedEntry}
      </p>
    </div>
  );
}

function resolveLogTone(entry: string): 'running' | 'success' | 'error' | 'warning' | 'neutral' {
  if (entry.startsWith('🔄')) return 'running';
  if (entry.startsWith('✅')) return 'success';
  if (entry.startsWith('❌')) return 'error';
  if (entry.startsWith('⚠️')) return 'warning';
  return 'neutral';
}
