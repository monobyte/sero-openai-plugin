import { useMemo, useState, type ReactNode } from 'react';
import { useAppState, useAppTools, useAvailableModels } from '@sero-ai/app-runtime';
import { Button, NativeSelect, NativeSelectOption, Switch } from '@sero-ai/ui';
import { createDefaultConfig, type EnhancementSettings, type OpenAIModelEnhancementConfig, type Verbosity } from '../shared/config';
import { OPENAI_COMPATIBILITY } from '../shared/compatibility';
import { effectiveSettings, removeOverride, setDefault, setModelEnabled, setOverride } from '../shared/state';
import './styles.css';

type BooleanSetting = {
  key: Exclude<keyof EnhancementSettings, 'verbosity'>;
  name: string;
  description: string;
  section: 'Behavior' | 'Tools' | 'Response';
};

const BOOLEAN_SETTINGS: BooleanSetting[] = [
  { key: 'promptAdaptation', name: 'Prompt adaptation', description: 'Add OpenAI guidance without replacing Sero context.', section: 'Behavior' },
  { key: 'webTools', name: 'Web tools', description: 'Enable web search and page reading.', section: 'Tools' },
  { key: 'imageGeneration', name: 'Image generation and edit', description: 'Create files with OpenAI image APIs.', section: 'Tools' },
  { key: 'imageFallback', name: 'Image fallback', description: 'Describe images when native image input is not available.', section: 'Tools' },
  { key: 'fastMode', name: 'Fast mode', description: 'Use priority processing for API-key and OAuth requests.', section: 'Response' },
];

const clone = (config: OpenAIModelEnhancementConfig): OpenAIModelEnhancementConfig => structuredClone(config);

export function OpenAIModelSettings() {
  const [saved, , ready] = useAppState<OpenAIModelEnhancementConfig>(createDefaultConfig());
  const [draft, setDraft] = useState<{ base: OpenAIModelEnhancementConfig; value: OpenAIModelEnhancementConfig } | null>(null);
  const [selected, setSelected] = useState('defaults');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const { run } = useAppTools();
  const { groups, loading, error } = useAvailableModels();
  const current = draft?.value ?? saved;
  const dirty = draft !== null && JSON.stringify(draft.value) !== JSON.stringify(saved);
  const available = useMemo(
    () => new Set(groups.flatMap((group) => group.models.map((model) => `${group.provider}/${model.modelId}`))),
    [groups],
  );
  const models = OPENAI_COMPATIBILITY.filter((model) => available.has(model.key));

  const edit = (updater: (config: OpenAIModelEnhancementConfig) => OpenAIModelEnhancementConfig) => {
    setDraft((previous) => previous
      ? { ...previous, value: updater(previous.value) }
      : { base: saved, value: updater(clone(saved)) });
    setStatus('');
  };

  const save = async () => {
    if (!dirty || !draft || saving) return;
    const pending = draft;
    setSaving(true);
    setStatus('');
    try {
      const result = await run('openai_extender_settings', { action: 'save', base: pending.base, value: pending.value });
      if (result.isError) throw new Error(result.text || 'OpenAI settings could not be saved.');
      setDraft((currentDraft) => currentDraft === pending ? null : currentDraft);
      setStatus('Saved');
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : 'OpenAI settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Loading OpenAI settings…</div>;
  }

  const selectedModel = selected === 'defaults' ? undefined : models.find((model) => model.key === selected);
  const enabled = selectedModel ? current.models[selectedModel.key]?.enabled === true : true;
  const values = selectedModel
    ? effectiveSettings({
      ...current,
      models: {
        ...current.models,
        [selectedModel.key]: { ...(current.models[selectedModel.key] ?? { overrides: {} }), enabled: true },
      },
    }, selectedModel.key)!
    : current.defaults;
  const change = <K extends keyof EnhancementSettings>(key: K, value: EnhancementSettings[K]) => edit(
    (config) => selectedModel ? setOverride(config, selectedModel.key, key, value) : setDefault(config, key, value),
  );
  const isOverride = (key: keyof EnhancementSettings) => Boolean(
    selectedModel && key in (current.models[selectedModel.key]?.overrides ?? {}),
  );
  const failed = Boolean(status && status !== 'Saved');
  const shortStatus = saving ? 'Saving…' : dirty && !status ? 'Unsaved changes' : status;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[10.5rem_minmax(0,1fr)] overflow-hidden md:grid-cols-[13.75rem_minmax(0,1fr)]">
      <aside className="overflow-auto border-r border-border bg-sidebar/50 p-2.5" aria-label="OpenAI settings pages">
        <NavButton active={selected === 'defaults'} title="Provider defaults" detail="Values for enabled models" onClick={() => setSelected('defaults')} />
        <p className="px-2.5 pb-1 pt-4 text-xs font-medium text-muted-foreground">Compatible models</p>
        {models.map((model) => {
          const state = current.models[model.key];
          const count = Object.keys(state?.overrides ?? {}).length;
          const detail = state?.enabled ? (count ? `${count} override${count === 1 ? '' : 's'}` : 'Uses defaults') : 'Not enabled';
          return <NavButton key={model.key} active={selected === model.key} title={model.displayName} detail={detail} onClick={() => setSelected(model.key)} />;
        })}
        {loading && <span className="block px-2.5 py-2 text-xs text-muted-foreground">Loading models…</span>}
        {error && <span className="block px-2.5 py-2 text-xs text-status-error">{error}</span>}
      </aside>

      <main className="flex min-w-0 flex-col bg-background">
        <header className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{selectedModel?.displayName ?? 'Provider defaults'}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selectedModel ? `OpenAI behavior for ${selectedModel.displayName}.` : 'Base values for each model that you enable.'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!failed && <span role="status" aria-live="polite" className="text-xs text-muted-foreground">{shortStatus}</span>}
              <Button className="text-xs" size="xs" variant="outline" disabled={!dirty || saving} onClick={() => { setDraft(null); setStatus(''); }}>Reset</Button>
              <Button className="text-xs" size="xs" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </header>
        {failed && (
          <div className="shrink-0 border-b border-status-error-border bg-status-error-faint px-4 py-2 text-xs text-status-error" role="status" aria-live="polite">
            {status}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {selectedModel ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-brand-primary-border bg-brand-primary-faint px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium">Use enhancements with this model</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{enabled ? 'Settings apply on the next turn.' : 'Normal Sero behavior stays unchanged.'}</p>
              </div>
              <Switch checked={enabled} aria-label={`Use enhancements with ${selectedModel.displayName}`} onCheckedChange={(value) => edit((config) => setModelEnabled(config, selectedModel.key, value))} />
            </div>
          ) : (
            <div className="rounded-lg border border-brand-primary-border bg-brand-primary-faint px-3 py-2.5 text-xs text-muted-foreground">
              These values do not enable a model. Each compatible model requires explicit opt-in.
            </div>
          )}

          <div className={!enabled ? 'pointer-events-none opacity-50' : ''}>
            {(['Behavior', 'Tools', 'Response'] as const).map((section) => (
              <section key={section} className="mt-4">
                <h3 className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">{section}</h3>
                <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
                  {BOOLEAN_SETTINGS.filter((item) => item.section === section).map((item) => (
                    <SettingRow key={item.key} name={item.name} description={item.description} override={isOverride(item.key)} onRestore={() => edit((config) => removeOverride(config, selectedModel!.key, item.key))}>
                      <Switch checked={values[item.key]} aria-label={item.name} disabled={!enabled} onCheckedChange={(value) => change(item.key, value)} />
                    </SettingRow>
                  ))}
                  {section === 'Response' && (
                    <SettingRow name="Verbosity" description="Set response detail, or Off to omit the plugin value." override={isOverride('verbosity')} onRestore={() => edit((config) => removeOverride(config, selectedModel!.key, 'verbosity'))}>
                      <NativeSelect className="min-w-24 text-xs" size="sm" aria-label="Verbosity" disabled={!enabled} value={values.verbosity} onChange={(event) => change('verbosity', event.target.value as Verbosity)}>
                        {(['off', 'low', 'medium', 'high'] as const).map((value) => <NativeSelectOption key={value}>{value}</NativeSelectOption>)}
                      </NativeSelect>
                    </SettingRow>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function NavButton({ active, title, detail, onClick }: { active: boolean; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" className={`flex w-full flex-col rounded-md px-2.5 py-2 text-left transition-colors ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent/60'}`} onClick={onClick}>
      <span className="truncate text-xs font-medium">{title}</span>
      <span className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</span>
    </button>
  );
}

function SettingRow({ name, description, override, onRestore, children }: { name: string; description: string; override: boolean; onRestore: () => void; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-b border-border px-3 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{name}</span>
          {override && <span className="rounded bg-brand-primary-faint px-1.5 py-0.5 text-xs text-brand-primary">Override</span>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {override && <Button className="text-xs" variant="ghost" size="xs" aria-label={`Use provider default for ${name}`} onClick={onRestore}>Use default</Button>}
        {children}
      </div>
    </div>
  );
}

export default OpenAIModelSettings;
