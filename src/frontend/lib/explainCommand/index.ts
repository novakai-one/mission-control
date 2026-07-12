// Deterministic, dependency-free command -> plain-English bullet phrasebook.
// Unknown binaries fall back to the raw segment (no LLM, no guessing).

const GIT_SUB: Record<string, string> = {
  'status': 'check git status', 'diff': 'show git diff', 'log': 'show git log', 'add': 'stage changes',
  'commit': 'commit changes', 'push': 'push commits', 'pull': 'pull changes', 'fetch': 'fetch from remote',
  'merge': 'merge branches', 'checkout': 'switch/checkout', 'branch': 'manage branches', 'remote': 'show git remotes',
  'clone': 'clone repo', 'stash': 'stash changes', 'init': 'init repo',
};

/** Shorten long absolute-ish paths to `…/<last two segments>`. */
function shortenPath(filePath: string): string {
  if (filePath.length > 40 && filePath.includes('/')) {
    const parts = filePath.split('/').filter(Boolean);
    return `…/${parts.slice(-2).join('/')}`;
  }
  return filePath;
}

function nonFlagArgs(args: string[]): string[] {
  return args.filter((value) => !value.startsWith('-'));
}

/** First `-N` or `-n N` count in a head/tail arg list. */
function extractCount(args: string[]): string | null {
  for (const value of args) {
    const dashNum = /^-(\d+)$/.exec(value);
    if (dashNum) return dashNum[1];
  }
  const flagIndex = args.indexOf('-n');
  return flagIndex >= 0 ? (args[flagIndex + 1] ?? null) : null;
}

/** First non-flag arg that isn't the value consumed by a preceding `-n`. */
function extractFile(args: string[]): string | undefined {
  return args.find((value, index) => !value.startsWith('-') && args[index - 1] !== '-n');
}

function describeHeadTail(label: 'first' | 'last', args: string[]): string {
  const count = extractCount(args);
  const file = extractFile(args);
  const countPart = count ? ` ${count}` : '';
  const filePart = file ? ` of ${shortenPath(file)}` : '';
  return `${label}${countPart} lines${filePart}`;
}

function describeEcho(args: string[]): string {
  if (args.length > 0 && args.every((value) => /^-+$/.test(value))) return 'print separator';
  return `print ${args.join(' ')}`;
}

function describeGit(args: string[]): string {
  const subcommand = args[0];
  if (!subcommand) return 'git';
  return GIT_SUB[subcommand] ?? `git ${subcommand}`;
}

type Handler = (args: string[], rest: string[]) => string;

const HANDLERS: Record<string, Handler> = {
  'cd': (_args, rest) => (rest[0] ? `enter ${shortenPath(rest[0])}` : 'enter home directory'),
  'ls': (_args, rest) => (rest[0] ? `list ${shortenPath(rest[0])}` : 'list directory'),
  'cat': (_args, rest) => (rest[0] ? `show contents of ${shortenPath(rest[0])}` : 'show contents'),
  echo: (args) => describeEcho(args),
  head: (args) => describeHeadTail('first', args),
  tail: (args) => describeHeadTail('last', args),
  grep: (_args, rest) => (rest[0] ? `search for ${rest[0]}` : 'search'),
  'git': (args) => describeGit(args),
  mkdir: (_args, rest) => (rest[0] ? `create directory ${shortenPath(rest[0])}` : 'create directory'),
  'rm': (_args, rest) => (rest[0] ? `remove ${shortenPath(rest[0])}` : 'remove'),
  'cp': (_args, rest) => (rest.length >= 2 ? `copy ${shortenPath(rest[0])} → ${shortenPath(rest[1])}` : 'copy'),
  'mv': (_args, rest) => (rest.length >= 2 ? `move ${shortenPath(rest[0])} → ${shortenPath(rest[1])}` : 'move'),
  touch: (_args, rest) => (rest[0] ? `create file ${shortenPath(rest[0])}` : 'create file'),
  'pwd': () => 'print working directory',
  find: () => 'find files',
  'wc': () => 'count lines/words',
  chmod: (_args, rest) => (rest.length ? `change permissions of ${shortenPath(rest[rest.length - 1])}` : 'change permissions'),
  export: (args) => `set env var ${args.join(' ')}`,
  'npm': (args) => `run npm ${args.join(' ')}`.trim(),
  yarn: (args) => `run yarn ${args.join(' ')}`.trim(),
  pnpm: (args) => `run pnpm ${args.join(' ')}`.trim(),
  node: (_args, rest) => (rest[0] ? `run node ${shortenPath(rest[0])}` : 'run node'),
};

/** Map one segment (binary + args) to a plain-English bullet. */
function explainSegment(segment: string): string {
  const tokens = segment.split(/\s+/).filter(Boolean);
  const binary = tokens[0];
  const args = tokens.slice(1);
  const rest = nonFlagArgs(args);
  const handler = HANDLERS[binary];
  return handler ? handler(args, rest) : segment;
}

/** Split a shell command into segments and gloss each into a plain-English bullet. */
export function explainCommand(command: string): string[] {
  return command
    .split(/&&|\|\||[;|]|\n/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map(explainSegment);
}
