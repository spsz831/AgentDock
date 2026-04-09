#!/usr/bin/env node
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const START_MARKER = '<!-- commits:auto:start -->';
const END_MARKER = '<!-- commits:auto:end -->';

function parseArgs(argv) {
  const args = {
    from: '',
    to: 'HEAD',
    file: '',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--from') {
      args.from = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--to') {
      args.to = argv[i + 1] ?? 'HEAD';
      i += 1;
      continue;
    }
    if (arg === '--file') {
      args.file = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
  }

  return args;
}

function classifyType(subject) {
  const conventional = subject.match(/^([a-zA-Z]+)(\([^)]+\))?!?:\s+/);
  if (!conventional) {
    return 'other';
  }
  return conventional[1].toLowerCase();
}

function labelFor(type) {
  switch (type) {
    case 'feat':
      return 'Features';
    case 'fix':
      return 'Fixes';
    case 'refactor':
      return 'Refactors';
    case 'test':
      return 'Tests';
    case 'docs':
      return 'Documentation';
    case 'chore':
      return 'Chores';
    default:
      return 'Other';
  }
}

function getCommits(from, to) {
  const range = `${from}..${to}`;
  const cmd = `git log --no-merges --pretty=format:%h%x09%s ${range}`;
  const output = execSync(cmd, { encoding: 'utf8' }).trim();
  if (!output) {
    return [];
  }
  return output.split('\n').map((line) => {
    const [hash, ...subjectParts] = line.split('\t');
    return { hash, subject: subjectParts.join('\t') };
  });
}

function renderSection(from, to, commits) {
  const orderedTypes = ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'other'];
  const groups = new Map();

  for (const type of orderedTypes) {
    groups.set(type, []);
  }
  for (const commit of commits) {
    const type = classifyType(commit.subject);
    const bucket = groups.get(type) ?? groups.get('other');
    bucket.push(commit);
  }

  const lines = [
    START_MARKER,
    `Range: \`${from}..${to}\``,
    '',
  ];

  if (commits.length === 0) {
    lines.push('- No commits found in this range.');
    lines.push(END_MARKER);
    return lines.join('\n');
  }

  for (const type of orderedTypes) {
    const items = groups.get(type) ?? [];
    if (items.length === 0) {
      continue;
    }
    lines.push(`### ${labelFor(type)}`);
    for (const item of items) {
      lines.push(`- \`${item.hash}\` ${item.subject}`);
    }
    lines.push('');
  }

  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  lines.push(END_MARKER);
  return lines.join('\n');
}

function updateFile(targetFile, section) {
  const absolute = path.resolve(targetFile);
  const content = fs.readFileSync(absolute, 'utf8');

  const hasMarkers = content.includes(START_MARKER) && content.includes(END_MARKER);
  if (!hasMarkers) {
    throw new Error(`Marker block not found in ${absolute}. Expected ${START_MARKER} ... ${END_MARKER}`);
  }

  const pattern = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`, 'm');
  const next = content.replace(pattern, section);
  fs.writeFileSync(absolute, next, 'utf8');
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.from) {
    console.error('Usage: node scripts/generate-commit-groups.js --from <git-ref> [--to <git-ref>] [--file <path>]');
    process.exit(1);
  }

  const commits = getCommits(args.from, args.to);
  const section = renderSection(args.from, args.to, commits);

  if (args.file) {
    updateFile(args.file, section);
    console.log(`Updated commit section in ${path.resolve(args.file)}`);
    return;
  }

  console.log(section);
}

main();
