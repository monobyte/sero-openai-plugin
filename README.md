# OpenAI Model Enhancements

`@sero-ai/plugin-openai-extender` adds optional settings and tools to compatible OpenAI models in Sero. The plugin is disabled after installation and does not change model behavior until you enable it.

## Install

In **Sero > Admin > Plugins**, install:

```text
git:https://github.com/monobyte/sero-openai-plugin.git
```

You can also install a local checkout by entering its absolute path.

The plugin requires Sero `0.8.0-beta.0` or newer and Pi SDK `0.84.2` or newer.

## Configure

Open **Admin > Model > OpenAI** and turn on **Enable enhancements**. The switch applies the settings to every compatible model, including models used by subagents. There are no per-model switches or overrides.

Changes save automatically. You can edit the settings while the plugin is disabled, then enable them when they are ready.

When a compatible model is selected in chat, a wand icon appears beside the model selector. The icon shows whether the plugin is active and opens the OpenAI settings page.

The settings control:

- prompt adaptation
- web search tools
- image generation and editing
- image fallback for models without native image input
- Fast mode
- response verbosity

Fast mode sends `service_tier: "priority"` for API-key and OAuth requests. Verbosity `low`, `medium`, or `high` sends `text.verbosity`. Select `off` to omit the plugin value.

## Compatible models

The plugin uses exact provider, API, and model matches. It does not infer support for new models.

| Provider | Pi API | Models |
| --- | --- | --- |
| `openai` | `openai-responses` | `gpt-5.4`, `gpt-5.3-codex`, `gpt-4.1` |
| `openai-codex` | `openai-codex-responses` | `gpt-5.3-codex-spark`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.5`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra` |

API-key models use the OpenAI Responses and Images APIs. OAuth models use Pi-managed Codex authentication and the Codex search and image endpoints. Image generation and editing use `gpt-image-2` on OAuth routes.

Spark does not declare native image input. Its image fallback can describe an attached image before the model handles the request. Native image input takes priority on other compatible models.

Generated images are saved under the workspace `.sero/generated/openai-extender` directory and appear as normal image tool results.

## State and privacy

Settings are profile-owned and stored in the active profile's `apps/openai-extender/state.json` file. The plugin does not store credentials, prompts, request payloads, or tool results in this file.

The plugin has no background runtime. It does not add voice controls, compaction controls, usage screens, workspace settings, or per-model settings.

## Development

```sh
npm install
npm test
npm run typecheck
npm run build
npm run pack:test
```
