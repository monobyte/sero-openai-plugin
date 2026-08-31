import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { createImage, describeImage, searchWeb, toToolError } from './openai-client';
import { prepareOutputDirectory, readWorkspaceImage, validateImage } from './image-security';
import { resolveStatePath, updateConfig } from './state-io';
import { mergeDraft, parseConfig } from '../shared/state';
import { readPublicPage } from './web-security';

const MAX_PAGE_CHARS = 20_000;
function textResult(text: string, details: Record<string, unknown> = {}) { return { content: [{ type: 'text' as const, text }], details }; }

export function registerOwnedTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'openai_extender_web_search', label: 'OpenAI Web Search', description: 'Search the web with OpenAI. Results include source URLs.',
    parameters: Type.Object({ query: Type.String({ minLength: 1, maxLength: 2_000 }) }),
    async execute(_id, params, signal, _update, ctx) {
      try { return textResult(await searchWeb(ctx, params.query, signal ?? new AbortController().signal)); }
      catch (error) { throw toToolError(error); }
    },
  });
  pi.registerTool({
    name: 'openai_extender_read_page', label: 'Read Web Page', description: 'Read bounded text from a public HTTP or HTTPS page. Always returns the source URL.',
    parameters: Type.Object({ url: Type.String({ minLength: 1, maxLength: 4_096 }) }),
    async execute(_id, params, signal) {
      try {
        const page = await readPublicPage(params.url, signal ?? new AbortController().signal);
        const html = page.body;
        const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_CHARS);
        return textResult(`${text}\n\nSource: ${page.url}`, { source: page.url, truncated: text.length === MAX_PAGE_CHARS });
      } catch (error) { throw toToolError(error); }
    },
  });
  pi.registerTool({
    name: 'openai_extender_describe_image', label: 'Describe Image', description: 'Describe an image only when the active compatible model cannot consume native image input.',
    parameters: Type.Object({ path: Type.String({ minLength: 1, maxLength: 4_096 }) }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        const { bytes, mime } = await readWorkspaceImage(ctx.cwd, params.path);
        return textResult(await describeImage(ctx, bytes, mime, signal ?? new AbortController().signal), { fallback: true });
      } catch (error) { throw toToolError(error); }
    },
  });
  pi.registerTool({
    name: 'openai_extender_image', label: 'OpenAI Image', description: 'Generate an image, or edit an existing workspace image when inputPath is supplied. Saves into the normal workspace .sero/generated folder.',
    parameters: Type.Object({ prompt: Type.String({ minLength: 1, maxLength: 4_000 }), inputPath: Type.Optional(Type.String({ maxLength: 4_096 })) }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        let input: Blob | undefined;
        if (params.inputPath) {
          const { bytes, mime } = await readWorkspaceImage(ctx.cwd, params.inputPath);
          input = new Blob([Uint8Array.from(bytes).buffer], { type: mime });
        }
        const image = await createImage(ctx, params.prompt, signal ?? new AbortController().signal, input);
        const mime = validateImage(image); const extension = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
        const directory = await prepareOutputDirectory(ctx.cwd);
        const outputPath = path.join(directory, `${randomUUID()}.${extension}`);
        await fs.writeFile(outputPath, image, { flag: 'wx', mode: 0o600 });
        return { content: [{ type: 'text', text: `Image saved to ${outputPath}` }, { type: 'image', data: Buffer.from(image).toString('base64'), mimeType: mime }], details: { path: outputPath, preview: true } };
      } catch (error) { throw toToolError(error); }
    },
  });
  pi.registerTool({
    name: 'openai_extender_settings', label: 'Save OpenAI Settings', description: 'Save this plugin settings with conflict detection.',
    parameters: Type.Object({ action: Type.Literal('save'), base: Type.Unknown(), value: Type.Unknown() }),
    async execute(_id, params) {
      const filePath = resolveStatePath();
      const base = parseConfig(params.base); const value = parseConfig(params.value);
      await updateConfig(filePath, (current) => mergeDraft(current, base, value));
      return textResult('OpenAI settings saved.', { saved: true });
    },
  });
}
