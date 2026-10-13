'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findExecutable, invocation, run, parseLogin, parseHealth, nodeCompatibility, checkEnvironment } = require('../extension/lib/runtime');

test('discovery skips relative PATH entries and respects explicit absolute overrides', () => {
  const visited = []; const options = { platform: 'linux', env: { PATH: '.:relative:/usr/bin' },
    exists: (file) => { visited.push(file); return file === '/usr/bin/codex'; } };
  assert.equal(findExecutable('codex', options), '/usr/bin/codex'); assert.deepEqual(visited, ['/usr/bin/codex']);
  assert.equal(findExecutable('codex', { ...options, configured: 'relative/codex' }), undefined);
  assert.equal(findExecutable('codex', { ...options, configured: '/unavailable/codex' }), undefined);
});

test('Windows discovery finds npm launcher without treating shell characters as commands', () => {
  const options = { platform: 'win32', env: { PATH: 'C:\\tools & data' },
    exists: (file) => file === 'C:\\tools & data\\openclaw.cmd' };
  assert.equal(findExecutable('openclaw', options), 'C:\\tools & data\\openclaw.cmd');
  assert.equal(invocation('C:\\tools\\arbitrary.cmd', options), undefined);
  assert.equal(findExecutable('openclaw', { ...options, env: { APPDATA: 'relative' } }), undefined);
});

test('Windows npm entry resolution requires a package entry and a native Node runtime', () => {
  const node = 'C:\\tools & data\\node.exe';
  for (const [name, entry] of [
    ['openclaw', 'C:\\tools & data\\node_modules\\openclaw\\openclaw.mjs'],
    ['codex', 'C:\\tools & data\\node_modules\\@openai\\codex\\bin\\codex.js'],
  ]) {
    const options = { platform: 'win32', env: { PATH: 'C:\\tools & data' },
      exists: (file) => [node, entry].includes(file) };
    assert.deepEqual(invocation(`C:\\tools & data\\${name}.cmd`, options), { file: node, prefix: [entry] });
    assert.equal(invocation(`C:\\tools & data\\${name}.cmd`, { ...options, exists: (file) => file === node }), undefined);
    assert.equal(invocation(`C:\\tools & data\\${name}.cmd`, { ...options, exists: (file) => file === entry }), undefined);
    assert.equal(invocation(`C:\\tools & data\\${name}.cmd`, { ...options,
      exists: (file) => file === entry || file.endsWith('node.cmd') }), undefined);
  }
});

test('Codex falls back to the installed native binary when an npm entry cannot run', async () => {
  const fallback = 'C:\\installed\\codex.exe';
  const options = { platform: 'win32', env: { PATH: 'C:\\tools' }, codexFallbacks: [fallback],
    exists: (file) => file === 'C:\\tools\\codex.cmd' || file === fallback,
    run: async (spec, args) => {
      if (!spec) return { code: null, unavailable: true };
      assert.equal(spec.file, fallback);
      return args[0] === '--version' ? { code: 0, stdout: 'codex-cli 1.2.3' }
        : { code: 1, stderr: 'Not logged in' };
    } };
  const snapshot = await checkEnvironment(options);
  assert.equal(snapshot.codex.found, true);
  assert.equal(snapshot.codex.version, '1.2.3');
  assert.equal(snapshot.codex.login, 'signedOut');
  const override = await checkEnvironment({ ...options, codexPath: 'C:\\tools\\codex.cmd' });
  assert.equal(override.codex.found, false);
});

test('OpenClaw Node requirements distinguish documented branches and unknown versions', () => {
  for (const value of ['24.16.0', '24.21.0', '26.1.0', '26.2.0']) {
    assert.equal(nodeCompatibility(value), 'supported', value);
  }
  for (const value of ['22.20.0', '24.15.9', '25.0.0', '26.0.9', '27.0.0']) {
    assert.equal(nodeCompatibility(value), 'unsupported', value);
  }
  for (const value of [undefined, '26.1.0-rc.1', 'unavailable']) {
    assert.equal(nodeCompatibility(value), 'unknown', value);
  }
});

test('successful process exit does not imply login or gateway connectivity', () => {
  assert.equal(parseLogin({ code: 0, stdout: 'status unavailable' }), 'unknown');
  assert.equal(parseLogin({ code: 0, stderr: 'Logged in using ChatGPT' }), 'signedIn');
  assert.equal(parseLogin({ code: 1, stderr: 'Not logged in' }), 'signedOut');
  assert.equal(parseHealth({ code: 0, stdout: '{"starting":true}' }), 'unknown');
  assert.equal(parseHealth({ code: 0, stdout: '{"ok":true}' }), 'reachable');
  assert.equal(parseHealth({ code: 1, stdout: '{"ok":true}' }), 'unreachable');
});

test('probe summaries omit raw errors, identities and tokens', async () => {
  const snapshot = await checkEnvironment({ platform: process.platform, exists: () => true,
    env: { PATH: process.platform === 'win32' ? 'C:\\tools' : '/usr/bin' },
    run: async (_spec, args) => {
      if (args[0] === '--version') return { code: 0, stdout: 'codex-cli 1.2.3' };
      if (args[0] === 'login') return { code: 0, stderr: 'Logged in using ChatGPT synthetic@example.invalid synthetic-token' };
      return { code: 1, stderr: 'private-host synthetic-token' };
    } });
  assert.equal(snapshot.codex.login, 'signedIn'); assert.doesNotMatch(JSON.stringify(snapshot), /synthetic-token|private-host|example.invalid/);
});

test('real subprocess receives metacharacters as literal arguments', async () => {
  const literal = '$(no-command) & quoted "text"';
  const result = await run({ file: process.execPath, prefix: [] }, ['-e', 'process.stdout.write(process.argv[1])', literal]);
  assert.equal(result.code, 0); assert.equal(result.stdout, literal);
});

test('real hung subprocess times out', async () => {
  const result = await run({ file: process.execPath, prefix: [] }, ['-e', 'setInterval(()=>{},1000)'], { timeout: 400 });
  assert.equal(result.failed, true); assert.equal(result.timedOut, true);
});
