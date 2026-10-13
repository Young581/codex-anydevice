'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

function isFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

function findExecutable(name, options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const exists = options.exists || isFile;
  const configured = options.configured || '';
  if (configured) {
    if (!paths.isAbsolute(configured) || /[\x00-\x1f\x7f]/.test(configured)) return undefined;
    return exists(configured) ? configured : undefined;
  }
  const rawPath = env.PATH || env.Path || env.path || '';
  const directories = rawPath.split(platform === 'win32' ? ';' : ':')
    .map((directory) => directory.replace(/^"|"$/g, ''))
    .filter((directory) => paths.isAbsolute(directory));
  if (platform === 'win32' && env.APPDATA && paths.isAbsolute(env.APPDATA)) {
    directories.push(paths.join(env.APPDATA, 'npm'));
  }
  for (const directory of directories) {
    for (const suffix of platform === 'win32' ? ['.exe', '.cmd', ''] : ['']) {
      const candidate = paths.join(directory, name + suffix);
      if (exists(candidate)) return candidate;
    }
  }
  for (const candidate of options.fallbacks || []) {
    if (paths.isAbsolute(candidate) && exists(candidate)) return candidate;
  }
  return undefined;
}

function invocation(file, options = {}) {
  if (!file) return undefined;
  const platform = options.platform || process.platform;
  const paths = platform === 'win32' ? path.win32 : path.posix;
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(file)) {
    // Resolve the npm package entry instead of passing paths or arguments to cmd.exe.
    const entries = {
      'codex.cmd': ['@openai', 'codex', 'bin', 'codex.js'],
    };
    const entryParts = entries[paths.basename(file).toLowerCase()];
    if (!entryParts) return undefined;
    const node = findExecutable('node', options);
    const entry = paths.join(paths.dirname(file), 'node_modules', ...entryParts);
    if (!node || /\.(cmd|bat)$/i.test(node) || !(options.exists || isFile)(entry)) return undefined;
    return { file: node, prefix: [entry] };
  }
  return { file, prefix: [] };
}

function run(spec, args, options = {}) {
  if (!spec) return Promise.resolve({ code: null, unavailable: true });
  return new Promise((resolve) => {
    execFile(spec.file, [...spec.prefix, ...args], {
      timeout: options.timeout || 8000, maxBuffer: 96 * 1024,
      windowsHide: true, shell: false, encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    }, (error, stdout, stderr) => resolve({
      code: error ? (typeof error.code === 'number' ? error.code : null) : 0,
      failed: Boolean(error), timedOut: Boolean(error && error.killed), stdout, stderr,
    }));
  });
}

function parseLogin(result) {
  const text = (result.stdout || '') + '\n' + (result.stderr || '');
  if (result.timedOut || result.unavailable) return 'unknown';
  const method = text.match(/^[ \t]*logged in using[ \t]+([^\r\n]+)/im)?.[1];
  if (result.code === 0 && method) {
    if (/^ChatGPT\b/i.test(method)) return 'chatgpt';
    if (/^(?:an? )?API key\b/i.test(method)) return 'apiKey';
    return 'signedIn';
  }
  if ([0, 1].includes(result.code) && /^[ \t]*not logged in[ \t]*$/im.test(text)) return 'signedOut';
  return 'unknown';
}

function version(result) {
  if (result.code !== 0) return undefined;
  const body = result.stdout || result.stderr || '';
  const pattern = /\b(\d+\.\d+\.\d+(?:[-.][a-zA-Z0-9.-]+)?)/;
  return body.match(pattern)?.[1];
}

async function checkEnvironment(options = {}) {
  const runner = options.run || run;
  const codexFile = findExecutable('codex', { ...options, configured: options.codexPath,
    fallbacks: options.codexFallbacks });
  const codex = invocation(codexFile, options) || (!options.codexPath
    ? (options.codexFallbacks || []).map((file) => (options.exists || isFile)(file)
      ? invocation(file, options) : undefined).find(Boolean) : undefined);
  const [codexVersion, login] = await Promise.all([
    runner(codex, ['--version']), runner(codex, ['login', 'status']),
  ]);
  // Only bounded versions and states leave this module; raw CLI output never reaches the UI.
  return {
    checked: true,
    codex: { found: Boolean(codex), version: version(codexVersion), login: parseLogin(login),
      detectedShim: Boolean(codexFile && !codex) },
  };
}

module.exports = { findExecutable, invocation, run, parseLogin, checkEnvironment };
