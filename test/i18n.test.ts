import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getLang, initI18n, normalizeLang, setLangForTest, t } from '../src/i18n';
import { loadConfig, setConfig } from '../src/core/config';
import { runCli } from '../src/cli';

beforeEach(() => {
  delete process.env.AGENTDOCK_LANG;
  setLangForTest();
});

afterEach(() => {
  delete process.env.AGENTDOCK_LANG;
  setLangForTest();
});

describe('i18n core', () => {
  it('defaults to English when nothing is configured', () => {
    setLangForTest();
    expect(getLang()).toBe('en');
    expect(t('install.complete', { path: '/x' })).toBe('Install completed: /x');
  });

  it('switches to zh-CN via setLangForTest', () => {
    setLangForTest('zh-CN');
    expect(getLang()).toBe('zh-CN');
    expect(t('install.complete', { path: '/x' })).toBe('安装完成：/x');
  });

  it('interpolates variables and falls back for unknown keys', () => {
    setLangForTest();
    expect(t('plan.summaryDryRun', { total: 3, conflicts: 1, hint: ' — use --overwrite to force' }))
      .toBe('3 entries, 1 conflict(s) — use --overwrite to force');
    expect(t('this.key.does.not.exist')).toBe('this.key.does.not.exist');
  });

  it('normalizeLang accepts aliases and rejects unknowns', () => {
    expect(normalizeLang('en')).toBe('en');
    expect(normalizeLang('ZH-CN')).toBe('zh-CN');
    expect(normalizeLang('zh')).toBe('zh-CN');
    expect(normalizeLang('cn')).toBe('zh-CN');
    expect(normalizeLang('fr')).toBeNull();
    expect(normalizeLang(undefined)).toBeNull();
  });
});

describe('i18n resolution precedence', () => {
  it('AGENTDOCK_LANG env wins over config', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-i18n-'));
    const cfgPath = path.join(dir, 'config.json');
    process.env.AGENTDOCK_CONFIG = cfgPath;
    await setConfig('lang', 'en'); // config says en
    process.env.AGENTDOCK_LANG = 'zh-CN'; // env overrides
    await initI18n();
    expect(getLang()).toBe('zh-CN');
    expect(t('install.complete', { path: '/x' })).toBe('安装完成：/x');
    delete process.env.AGENTDOCK_CONFIG;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('config lang is used when env is absent', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-i18n2-'));
    const cfgPath = path.join(dir, 'config.json');
    process.env.AGENTDOCK_CONFIG = cfgPath;
    delete process.env.AGENTDOCK_LANG;
    await setConfig('lang', 'zh-CN');
    await initI18n();
    expect(getLang()).toBe('zh-CN');
    const cfg = await loadConfig();
    expect(cfg.lang).toBe('zh-CN');
    delete process.env.AGENTDOCK_CONFIG;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('invalid config lang is ignored (falls back to en)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-i18n3-'));
    const cfgPath = path.join(dir, 'config.json');
    process.env.AGENTDOCK_CONFIG = cfgPath;
    delete process.env.AGENTDOCK_LANG;
    // Write a raw config with an unsupported lang (setConfig would reject it, so write directly).
    await fs.writeFile(cfgPath, JSON.stringify({ lang: 'fr' }), 'utf8');
    await initI18n();
    expect(getLang()).toBe('en');
    delete process.env.AGENTDOCK_CONFIG;
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('rejects an unsupported lang via setConfig validation', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentdock-i18n4-'));
    const cfgPath = path.join(dir, 'config.json');
    process.env.AGENTDOCK_CONFIG = cfgPath;
    const res = await runCli(['config', 'set', 'lang', 'fr']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr.join(' ')).toContain('lang must be one of');
    delete process.env.AGENTDOCK_CONFIG;
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('i18n end-to-end through CLI', () => {
  it('localizes human-readable output (zh-CN usage on unknown command)', async () => {
    process.env.AGENTDOCK_LANG = 'zh-CN';
    const result = await runCli(['not-a-command']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.join(' ')).toContain('用法：agentdock');
  });
});
