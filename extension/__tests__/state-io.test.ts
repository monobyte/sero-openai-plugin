import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../shared/config';
import { setDefault } from '../../shared/state';
import { readConfig, resolveStatePath, updateConfig, writeConfig } from '../state-io';

describe('profile state I/O', () => {
  it('resolves a different file for each Sero profile home', () => {
    expect(resolveStatePath({ SERO_HOME: '/profiles/a' })).toBe(path.join('/profiles/a', 'apps/openai-extender/state.json'));
    expect(resolveStatePath({ SERO_HOME: '/profiles/b' })).not.toBe(resolveStatePath({ SERO_HOME: '/profiles/a' }));
  });
  it('returns disabled defaults for a missing file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'oai-state-'));
    await expect(readConfig(path.join(root, 'missing.json'))).resolves.toEqual(createDefaultConfig());
  });
  it('treats the host app-state null sentinel as uninitialized state', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'oai-state-')); const file = path.join(root, 'state.json');
    await writeFile(file, 'null', 'utf8');
    await expect(readConfig(file)).resolves.toEqual(createDefaultConfig());
  });
  it('writes atomically and leaves no temporary file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'oai-state-')); const file = path.join(root, 'nested/state.json');
    await writeConfig(file, createDefaultConfig());
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(createDefaultConfig());
    const { readdir } = await import('node:fs/promises');
    expect((await readdir(path.dirname(file))).filter((name) => name.includes('.tmp.'))).toEqual([]);
  });
  it('reports malformed state and preserves the original bytes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'oai-state-')); const file = path.join(root, 'state.json');
    await writeFile(file, '{broken', 'utf8');
    await expect(readConfig(file)).rejects.toThrow('saved file was preserved');
    expect(await readFile(file, 'utf8')).toBe('{broken');
  });
  it('preserves the canonical file when atomic rename fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'oai-state-')); const file = path.join(root, 'state.json');
    await writeConfig(file, createDefaultConfig()); const original = await readFile(file, 'utf8');
    const failing = { ...fs, rename: async () => { throw new Error('injected rename failure'); } };
    await expect(writeConfig(file, createDefaultConfig(), failing)).rejects.toThrow('injected rename failure');
    expect(await readFile(file, 'utf8')).toBe(original);
    expect((await readdir(root)).filter((name) => name.includes('.tmp.'))).toEqual([]);
  });
  it('serializes concurrent updates without losing an independent change', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'oai-state-')); const file = path.join(root, 'state.json');
    await Promise.all([
      updateConfig(file, (current) => setDefault(current, 'webTools', true)),
      updateConfig(file, (current) => setDefault(current, 'fastMode', true)),
    ]);
    await expect(readConfig(file)).resolves.toMatchObject({ defaults: { webTools: true, fastMode: true } });
  });
  it('recovers an abandoned save lock from a dead process', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'oai-state-')); const file = path.join(root, 'state.json');
    await writeFile(`${file}.lock`, JSON.stringify({ pid: 999_999_999, createdAt: Date.now() }), 'utf8');
    await updateConfig(file, (current) => setDefault(current, 'webTools', true));
    await expect(readConfig(file)).resolves.toMatchObject({ defaults: { webTools: true } });
    await expect(readFile(`${file}.lock`, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
