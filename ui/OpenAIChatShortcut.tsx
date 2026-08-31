import { useMemo } from 'react';
import { openSeroApp, useAppState } from '@sero-ai/app-runtime';
import { Button } from '@sero-ai/ui';
import { createDefaultConfig } from '../shared/config';
import { parseConfig } from '../shared/state';
import './styles.css';

const OPENAI_SETTINGS_KEY = 'openai-extender:ui.admin.model-settings:openai-model-settings';

export function OpenAIChatShortcut() {
  const [savedValue, , ready] = useAppState<unknown>(createDefaultConfig());
  const config = useMemo(() => parseConfig(savedValue), [savedValue]);
  if (!ready) return null;
  const label = config.enabled ? 'Edit active OpenAI enhancements' : 'Configure OpenAI enhancements';

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      title={label}
      aria-label={label}
      className={config.enabled ? 'bg-brand-primary-faint text-brand-primary' : 'text-muted-foreground'}
      onClick={() => void openSeroApp('admin', { section: 'model', modelSettingsKey: OPENAI_SETTINGS_KEY })}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 4 5 5L8.5 20.5a2.1 2.1 0 0 1-3-3Z" />
        <path d="m13 6 5 5" />
        <path d="M6 3v4M4 5h4M19 15v4M17 17h4" />
      </svg>
    </Button>
  );
}

export default OpenAIChatShortcut;
