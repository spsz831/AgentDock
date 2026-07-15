import { loadConfig } from '../core/config';

export type Lang = 'en' | 'zh-CN';

const FALLBACK: Lang = 'en';

/** User-facing strings. Machines read `--json` output, which is never localized. */
const DICTIONARIES: Record<Lang, Record<string, string>> = {
  en: {
    'cli.usage': 'Usage: agentdock <scan|export|install|validate|doctor|list|diff|config|uninstall> [path]',
    'install.complete': 'Install completed: {path}',
    'uninstall.complete': 'Uninstall complete: {path}',
    'uninstall.dryRunHeader': 'Uninstall plan (dry-run — no changes made): {path}',
    'dryrun.header': 'Install plan (dry-run — no changes written):',
    'diff.header': 'Diff vs current target:',
    'plan.summaryDryRun': '{total} entries, {conflicts} conflict(s){hint}',
    'plan.summaryDiff': '{total} entries, {conflicts} would conflict{hint}',
    'plan.forceHint': ' — use --overwrite to force',
    'plan.conflictHint': ' (install would refuse without --overwrite)',
    'config.title': 'Configuration:',
    'config.set': 'set {key} = {value}',
    'config.unknownKey': 'Unknown config key: {key} (valid: {valid})',
    'config.invalidValue': 'Invalid value for {key}: {reason}',
    'config.usage': 'Usage: agentdock config <list|get|set> [key] [value]',
    'config.unset': 'unset {key}',
    'config.file': 'config file: {path}',
    'config.noSettings': '(no settings — command defaults apply)',
    'config.unsetValue': '(unset)',
  },
  'zh-CN': {
    'cli.usage': '用法：agentdock <scan|export|install|validate|doctor|list|diff|config|uninstall> [path]',
    'install.complete': '安装完成：{path}',
    'uninstall.complete': '卸载完成：{path}',
    'uninstall.dryRunHeader': '卸载计划（dry-run — 未做任何改动）：{path}',
    'dryrun.header': '安装计划（dry-run — 未写入任何文件）：',
    'diff.header': '与当前目标机的差异：',
    'plan.summaryDryRun': '{total} 项，{conflicts} 处冲突{hint}',
    'plan.summaryDiff': '{total} 项，{conflicts} 处会冲突{hint}',
    'plan.forceHint': ' — 使用 --overwrite 强制覆盖',
    'plan.conflictHint': '（不使用 --overwrite 安装会拒绝）',
    'config.title': '当前配置：',
    'config.set': '已设置 {key} = {value}',
    'config.unknownKey': '未知配置项：{key}（合法值：{valid}）',
    'config.invalidValue': '配置项 {key} 的值无效：{reason}',
    'config.usage': '用法：agentdock config <list|get|set> [key] [value]',
    'config.unset': '已清除 {key}',
    'config.file': '配置文件：{path}',
    'config.noSettings': '（暂无设置 — 使用命令默认值）',
    'config.unsetValue': '（未设置）',
  },
};

/** Normalize a raw locale string to a supported Lang, or null if unsupported. */
export function normalizeLang(value?: string): Lang | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v === 'en' || v === 'english') return 'en';
  if (v === 'zh' || v === 'zh-cn' || v === 'zh_cn' || v === 'cn' || v === 'chinese') return 'zh-CN';
  return null;
}

function langFromEnv(): Lang | null {
  return normalizeLang(typeof process !== 'undefined' ? process.env.AGENTDOCK_LANG : undefined);
}

let currentLang: Lang = langFromEnv() ?? FALLBACK;

export function getLang(): Lang {
  return currentLang;
}

/**
 * Resolve the active language. Precedence: `AGENTDOCK_LANG` env > `lang` in
 * AgentDock config > English fallback. Call once at CLI startup.
 */
export async function initI18n(): Promise<void> {
  const envLang = langFromEnv();
  if (envLang) {
    currentLang = envLang;
    return;
  }
  try {
    const cfg = await loadConfig();
    const cfgLang = normalizeLang(cfg.lang);
    if (cfgLang) {
      currentLang = cfgLang;
    }
  } catch {
    // keep env/default
  }
}

/** Translate a key with optional `{var}` interpolation. Falls back to English, then the key itself. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = DICTIONARIES[currentLang] ?? DICTIONARIES[FALLBACK];
  let str = dict[key] ?? DICTIONARIES[FALLBACK][key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
    }
  }
  return str;
}

/** Test-only: force a language. Pass `undefined` to reset to env/default. */
export function setLangForTest(lang?: Lang): void {
  currentLang = lang ?? langFromEnv() ?? FALLBACK;
}
