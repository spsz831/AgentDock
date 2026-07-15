import { COMMAND_ERROR_CODES } from '../constants/command-error-codes';
import type { CommandResult, ParsedCliOptions } from '../manifest/types';
import { toJsonError, toJsonLine } from '../utils/command-json';
import { t } from '../i18n';
import {
  getConfigPath,
  isConfigKey,
  listConfigKeys,
  loadConfig,
  setConfig,
  validateConfigValue,
  type ConfigKey,
} from '../core/config';

export async function runConfigCommand(positionals: string[] = [], options: ParsedCliOptions = {}): Promise<CommandResult> {
  const sub = positionals[0];

  const usage = (message: string): CommandResult => {
    if (options.json === true) {
      return {
        exitCode: 1,
        stdout: [toJsonLine('config', false, { path: getConfigPath() }, [toJsonError(COMMAND_ERROR_CODES.UNKNOWN_ERROR, message)])],
        stderr: [],
      };
    }
    return { exitCode: 1, stdout: [], stderr: [message] };
  };

  // `config` / `config list` — show all settings.
  if (!sub || sub === 'list') {
    const config = await loadConfig();
    if (options.json === true) {
      return {
        exitCode: 0,
        stdout: [toJsonLine('config', true, { path: getConfigPath(), config }, [])],
        stderr: [],
      };
    }
    const lines = [t('config.file', { path: getConfigPath() })];
    if (Object.keys(config).length === 0) {
      lines.push(`  ${t('config.noSettings')}`);
    }
    for (const key of listConfigKeys()) {
      const value = config[key as ConfigKey];
      lines.push(`  ${key} = ${value ?? t('config.unsetValue')}`);
    }
    return { exitCode: 0, stdout: lines, stderr: [] };
  }

  if (sub === 'get') {
    const key = positionals[1];
    if (!key || !isConfigKey(key)) {
      return usage(t('config.usage'));
    }
    const config = await loadConfig();
    const value = config[key as ConfigKey];
    if (options.json === true) {
      return {
        exitCode: 0,
        stdout: [toJsonLine('config', true, { path: getConfigPath(), key, value: value ?? null }, [])],
        stderr: [],
      };
    }
    return { exitCode: 0, stdout: [value ?? t('config.unsetValue')], stderr: [] };
  }

  if (sub === 'set') {
    const key = positionals[1];
    const value = positionals[2];
    if (!key || !isConfigKey(key) || value === undefined) {
      return usage(t('config.usage'));
    }
    const ck = key as ConfigKey;
    const err = validateConfigValue(ck, value);
    if (err) {
      return usage(t('config.invalidValue', { key: ck, reason: err }));
    }
    const next = await setConfig(ck, value);
    if (options.json === true) {
      return {
        exitCode: 0,
        stdout: [toJsonLine('config', true, { path: getConfigPath(), key: ck, value: next[ck] }, [])],
        stderr: [],
      };
    }
    return { exitCode: 0, stdout: [t('config.set', { key: ck, value: next[ck] ?? '' })], stderr: [] };
  }

  return usage(t('config.usage'));
}
