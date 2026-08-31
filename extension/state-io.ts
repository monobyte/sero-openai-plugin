import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDefaultConfig, type OpenAIModelEnhancementConfig } from '../shared/config';
import { parseConfig } from '../shared/state';

export interface AtomicFileSystem {
  mkdir: typeof fs.mkdir;
  open: typeof fs.open;
  rename: typeof fs.rename;
  rm: typeof fs.rm;
}

export function resolveStatePath(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  const seroHome = env.SERO_HOME ?? path.join(home, '.sero-ui');
  return path.join(seroHome, 'apps', 'openai-extender', 'state.json');
}
function isMissing(error: unknown): boolean { return error instanceof Error && 'code' in error && error.code === 'ENOENT'; }
export async function readConfig(filePath: string): Promise<OpenAIModelEnhancementConfig> {
  try {
    const value: unknown = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return value === null ? createDefaultConfig() : parseConfig(value);
  }
  catch (error) {
    if (isMissing(error)) return createDefaultConfig();
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`OpenAI enhancement state at ${filePath} is unreadable. The saved file was preserved. ${detail}`);
  }
}
export async function writeConfig(filePath: string, config: OpenAIModelEnhancementConfig, io: AtomicFileSystem = fs): Promise<void> {
  const validated = parseConfig(config);
  await io.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    const handle = await io.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await io.rename(temporary, filePath);
  } finally { await io.rm(temporary, { force: true }); }
}

function isAlreadyExists(error: unknown): boolean { return error instanceof Error && 'code' in error && error.code === 'EEXIST'; }
function isMissingFile(error: unknown): boolean { return error instanceof Error && 'code' in error && error.code === 'ENOENT'; }

interface LockOwner { pid: number; createdAt: number }

function processIsAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error instanceof Error && 'code' in error && error.code === 'EPERM'; }
}

async function removeStaleLock(lockPath: string, now = Date.now()): Promise<void> {
  let owner: LockOwner | undefined;
  let modifiedAt = 0;
  try {
    const [raw, stat] = await Promise.all([fs.readFile(lockPath, 'utf8'), fs.stat(lockPath)]);
    modifiedAt = stat.mtimeMs;
    const parsed = JSON.parse(raw) as Partial<LockOwner>;
    if (typeof parsed.pid === 'number' && typeof parsed.createdAt === 'number') owner = parsed as LockOwner;
  } catch (error) {
    if (isMissingFile(error)) return;
  }
  const stale = owner ? !processIsAlive(owner.pid) || now - owner.createdAt > 30_000 : now - modifiedAt > 30_000;
  if (!stale) return;
  try { await fs.rm(lockPath); }
  catch (error) { if (!isMissingFile(error)) throw error; }
}

export async function updateConfig(
  filePath: string,
  updater: (current: OpenAIModelEnhancementConfig) => OpenAIModelEnhancementConfig,
): Promise<OpenAIModelEnhancementConfig> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  let lock: Awaited<ReturnType<typeof fs.open>> | undefined;
  for (let attempt = 0; attempt < 100 && !lock; attempt += 1) {
    try {
      lock = await fs.open(lockPath, 'wx', 0o600);
      await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now() } satisfies LockOwner), 'utf8');
      await lock.sync();
    }
    catch (error) {
      if (!isAlreadyExists(error)) throw error;
      await removeStaleLock(lockPath);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  if (!lock) throw new Error('OpenAI settings are busy. Try again.');
  try {
    const next = parseConfig(updater(await readConfig(filePath)));
    await writeConfig(filePath, next);
    return next;
  } finally { await lock.close(); await fs.rm(lockPath, { force: true }); }
}
