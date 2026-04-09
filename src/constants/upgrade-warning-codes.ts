export const UPGRADE_WARNING_CODES = {
  FORMAT_ONLY_CHANGE: 'FORMAT_ONLY_CHANGE',
} as const;

export type UpgradeWarningCode = typeof UPGRADE_WARNING_CODES[keyof typeof UPGRADE_WARNING_CODES];

export const UPGRADE_WARNING_MESSAGES: Record<UpgradeWarningCode, string> = {
  [UPGRADE_WARNING_CODES.FORMAT_ONLY_CHANGE]:
    'Upgrade only changed formatting or normalization, no new destinations were introduced.',
};
