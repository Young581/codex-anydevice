'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const manifest = readJson('package.json');

assert.equal(manifest.name, 'codex-anydevice');
assert.equal(manifest.publisher, 'Young581');
assert.equal(manifest.license, 'MIT');
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(manifest.capabilities.untrustedWorkspaces.supported, false);
assert.equal(manifest.capabilities.virtualWorkspaces.supported, false);
assert.equal(manifest.dependencies, undefined);
assert.equal(manifest.devDependencies, undefined);
const defaultLocale = readJson('package.nls.json');
const chineseLocale = readJson('package.nls.zh-cn.json');
assert.deepEqual(Object.keys(chineseLocale).sort(), Object.keys(defaultLocale).sort());
for (const command of manifest.contributes.commands) {
  assert.ok(command.command.startsWith('codexAnyDevice.'));
  const key = command.title.replace(/^%|%$/g, '');
  assert.ok(defaultLocale[key] && chineseLocale[key], `Missing locale: ${key}`);
}

const javascript = (directory) => fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
  const relative = `${directory}/${entry.name}`;
  return entry.isDirectory() ? javascript(relative) : relative.endsWith('.js') ? [relative] : [];
});
for (const file of [...javascript('extension'), ...javascript('scripts'), ...javascript('tests')]) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
for (const config of Object.values(manifest.contributes.configuration.properties)) {
  const key = config.description.replace(/^%|%$/g, '');
  assert.ok(defaultLocale[key] && chineseLocale[key], `Missing setting locale: ${key}`);
  assert.equal(config.scope, 'machine');
}

const docs = fs.readdirSync(path.join(root, 'docs')).map((file) => `docs/${file}`);
const markdown = ['README.md', 'README.en.md', 'CHANGELOG.md', 'CONTRIBUTING.md',
  'PRIVACY.md', 'SECURITY.md', 'UPSTREAM.md', ...docs];
for (const name of markdown) {
  const body = fs.readFileSync(path.join(root, name), 'utf8');
  for (const match of body.matchAll(/\]\(([^)]+)\)/g)) {
    const href = match[1];
    if (/^(?:https?:|#|mailto:)/.test(href)) continue;
    assert.ok(fs.existsSync(path.resolve(root, path.dirname(name), href.split('#')[0])),
      `${name}: missing link ${href}`);
  }
}
const settings = readJson('.github/repository-settings.json');
assert.equal(settings.repository, 'Young581/codex-anydevice');
assert.equal(settings.workflow_permissions.default_workflow_permissions, 'read');
assert.equal(settings.workflow_permissions.can_approve_pull_request_reviews, false);
console.log('Manifest, localization, JavaScript and documentation links passed.');
