# OpenAI Model Enhancements

`@sero-ai/plugin-openai-extender` is an independent external Sero plugin. It adds optional OpenAI behavior to selected models. Installing it does not change model behavior. Open **OpenAI Model Enhancements**, select a compatible model, enable it, adjust inherited settings, and save.

The same `OpenAIModelSettings` form is available in **Admin > Model > OpenAI** through `ui.admin.model-settings`. State is profile-owned at `$SERO_HOME/apps/openai-extender/state.json`. Sero and the Pi extension watch or reload this one versioned file. The plugin never stores credentials, prompts, request payloads, or tool results there.

## Supported POC routes

| Provider | Pi API | Models |
| --- | --- | --- |
| `openai` | `openai-responses` | `gpt-5.4`, `gpt-5.3-codex`, `gpt-4.1` |
| `openai-codex` | `openai-codex-responses` | `gpt-5.3-codex-spark`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.5`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra` |

Both API-key `openai` routes and authenticated `openai-codex` routes are supported. Every model requires explicit opt-in. New models are not inferred or enabled.

Provider defaults control prompt adaptation, owned web tools, image generation/edit, image fallback, Fast mode, and verbosity. A model stores only values that differ from the provider default. Disabling a model keeps its overrides but applies none of them.

Fast mode sets `service_tier: "priority"` for API-key and OAuth requests. Verbosity `low`, `medium`, or `high` sets `text.verbosity`; `off` adds no plugin value. Rewrites are immutable and preserve unrelated fields. Web and image tools use the active model's Pi-managed authentication. API-key models use the OpenAI Responses and Images APIs. OAuth models use the Codex search and image endpoints, including `gpt-image-2` for generation and editing. Generated images use the workspace `.sero/generated/openai-extender` path and normal image tool-result preview content.

## Limitations

The POC has no background runtime. It does not add Code Mode, voice, compaction controls, usage screens, workspace settings, or ChatPanel controls. Native image input always takes priority over fallback. Spark is marked without native image input so the configured fallback can handle images on that route.

## Development

Requires Sero `0.8.0-beta.0` or newer and Pi SDK `0.84.2` or newer.

```sh
npm install
npm test
npm run typecheck
npm run build
npm run pack:test
```
