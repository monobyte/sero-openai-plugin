import { OpenAIModelSettings } from './OpenAIModelSettings';
import './styles.css';

export function OpenAIApp() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-primary-subtle text-xs font-semibold text-brand-primary">
          AI
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">OpenAI Model Enhancements</h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Optional behavior for compatible OpenAI models
          </p>
        </div>
      </header>
      <OpenAIModelSettings />
    </div>
  );
}

export default OpenAIApp;
