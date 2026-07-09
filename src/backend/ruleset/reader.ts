import fs from 'node:fs';
import path from 'node:path';

export interface HookConfig {
  event: string;
  matcher: string | null;
  command: string;
  scriptPath: string | null;
}

export interface GateScript {
  fileName: string;
  relativePath: string;
  source: string;
  size: number;
  hookEvents: string[];
  matchers: string[];
}

export interface RulesetData {
  hooks: HookConfig[];
  gates: GateScript[];
  claudeMd: string | null;
  claudeMdPath: string | null;
  projectPath: string;
  toolsPath: string | null;
}

/**
 * Decode an encoded project dir name back to a real filesystem path.
 * `.claude/projects/-Users-foo-bar` → `/Users/foo/bar`
 */
function decodeProjectDir(dirName: string): string {
  return '/' + dirName.replace(/-/g, '/');
}

/**
 * Extract the script path from a hook command string.
 * e.g. "node tools/novakai/gates/contract-gate.mjs" → "tools/novakai/gates/contract-gate.mjs"
 *      "npm run --silent novakai:onboard" → null
 */
function extractScriptPath(command: string): string | null {
  const match = command.match(/\b(node|npx|tsx?)\s+(.+\.m?js)\b/);
  if (match) return match[2];
  return null;
}

/**
 * Parse `.claude/settings.json` hooks config into structured hook configs.
 */
function parseHooksConfig(settingsPath: string, projectRoot: string): HookConfig[] {
  const hooks: HookConfig[] = [];
  let settings: any;

  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return hooks;
  }

  const hooksConfig = settings.hooks || {};
  for (const [event, entries] of Object.entries(hooksConfig)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const matcher = entry.matcher || null;
      const hookList = entry.hooks || [];
      for (const hook of hookList) {
        const command = hook.command || '';
        const scriptPath = extractScriptPath(command);
        hooks.push({
          event,
          matcher,
          command,
          scriptPath: scriptPath ? path.join(projectRoot, scriptPath) : null,
        });
      }
    }
  }

  return hooks;
}

/**
 * Read a gate script file and extract metadata.
 */
function readGateScript(filePath: string, projectRoot: string): GateScript | null {
  let source: string;
  try {
    source = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  const relativePath = path.relative(projectRoot, filePath);
  const fileName = path.basename(filePath);
  const stat = fs.statSync(filePath);

  // Extract hook events and matchers from the header comment
  const hookEvents: string[] = [];
  const matchers: string[] = [];

  // Match "PreToolUse", "Stop", "SessionStart", "SubagentStop" in comments
  const eventPattern = /\b(PreToolUse|PostToolUse|SessionStart|Stop|SubagentStop|Notification)\b/g;
  let m: RegExpExecArray | null;
  while ((m = eventPattern.exec(source)) !== null) {
    if (!hookEvents.includes(m[1])) hookEvents.push(m[1]);
  }

  // Match tool matchers like "Agent|Task", "Edit|Write", "Read|Grep|Glob", "Bash", "ExitPlanMode"
  const matcherPattern = /(?:matcher[:\s]+|gates?\s+for\s+)([A-Z][a-z]+(?:\|[A-Z][a-z]+)*)/g;
  while ((m = matcherPattern.exec(source)) !== null) {
    if (!matchers.includes(m[1])) matchers.push(m[1]);
  }

  return {
    fileName,
    relativePath,
    source,
    size: stat.size,
    hookEvents,
    matchers,
  };
}

/**
 * Find all gate scripts referenced in the hooks config.
 * Looks in common locations: tools/novakai/gates/ and tools/novakai/status/
 */
function findGateScripts(hooks: HookConfig[], projectRoot: string): GateScript[] {
  const gates: GateScript[] = [];
  const seenPaths = new Set<string>();

  // From hooks config: scripts referenced by node commands
  for (const hook of hooks) {
    if (!hook.scriptPath) continue;
    if (seenPaths.has(hook.scriptPath)) continue;
    if (!fs.existsSync(hook.scriptPath)) continue;
    const gate = readGateScript(hook.scriptPath, projectRoot);
    if (gate) {
      gates.push(gate);
      seenPaths.add(hook.scriptPath);
    }
  }

  // Also scan tools/novakai/gates/ for any .mjs files not already covered
  const gatesDirs = [
    path.join(projectRoot, 'tools', 'novakai', 'gates'),
    path.join(projectRoot, 'tools', 'novakai', 'status'),
  ];

  for (const dir of gatesDirs) {
    if (!fs.existsSync(dir)) continue;
    let files: string[];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.mjs')) continue;
      if (file.endsWith('.test.mjs')) continue;
      const fullPath = path.join(dir, file);
      if (seenPaths.has(fullPath)) continue;
      const gate = readGateScript(fullPath, projectRoot);
      if (gate) {
        gates.push(gate);
        seenPaths.add(fullPath);
      }
    }
  }

  return gates;
}

/**
 * Find and read CLAUDE.md from the project root.
 */
function readClaudeMd(projectRoot: string): { content: string | null; path: string | null } {
  const candidates = [
    path.join(projectRoot, 'CLAUDE.md'),
    path.join(projectRoot, '.claude', 'CLAUDE.md'),
  ];

  for (const candidate of candidates) {
    try {
      const content = fs.readFileSync(candidate, 'utf8');
      return { content, path: candidate };
    } catch {
      // try next
    }
  }

  return { content: null, path: null };
}

/**
 * Find the tools directory path.
 */
function findToolsPath(projectRoot: string): string | null {
  const candidates = [
    path.join(projectRoot, 'tools'),
    path.join(projectRoot, 'tools', 'novakai'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return null;
}

/**
 * Read the complete ruleset data for a project.
 * @param projectDirName The encoded directory name from .claude/projects/
 */
export function readRuleset(projectDirName: string): RulesetData {
  const projectPath = decodeProjectDir(projectDirName);

  // Default empty result
  const empty: RulesetData = {
    hooks: [],
    gates: [],
    claudeMd: null,
    claudeMdPath: null,
    projectPath,
    toolsPath: null,
  };

  // Check project root exists
  if (!fs.existsSync(projectPath)) return empty;

  // Read .claude/settings.json
  const settingsPath = path.join(projectPath, '.claude', 'settings.json');
  const hooks = parseHooksConfig(settingsPath, projectPath);

  // Find gate scripts
  const gates = findGateScripts(hooks, projectPath);

  // Read CLAUDE.md
  const { content: claudeMd, path: claudeMdPath } = readClaudeMd(projectPath);

  // Find tools path
  const toolsPath = findToolsPath(projectPath);

  return {
    hooks,
    gates,
    claudeMd,
    claudeMdPath,
    projectPath,
    toolsPath,
  };
}
