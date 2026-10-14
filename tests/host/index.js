'use strict';

const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function run() {
  const extension = vscode.extensions.getExtension('Young581.codex-anydevice');
  assert.ok(extension, 'Extension is installed in the isolated host');
  assert.equal(extension.packageJSON.version, '0.4.0');
  assert.equal(extension.packageJSON.contributes.configuration.properties['codexAnyDevice.openclawPath'], undefined);
  if (process.env.ANYDEVICE_HOST_EXPECT_EXTENSION_PATH) {
    assert.equal(await fs.realpath(extension.extensionPath),
      await fs.realpath(process.env.ANYDEVICE_HOST_EXPECT_EXTENSION_PATH));
  }
  const api = await extension.activate();
  const controller = api.controller;
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('codexAnyDevice.openSetup'));
  for (const command of ['connectQQ', 'disconnectQQ', 'pairQQ']) assert.ok(commands.includes('codexAnyDevice.' + command));
  assert.equal(controller.direct.status, 'disconnected');
  assert.equal(controller.direct.snapshot().paired, false);
  await vscode.commands.executeCommand('codexAnyDevice.openSetup');
  assert.ok(controller.panel);
  const firstPanel = controller.panel;
  await vscode.commands.executeCommand('codexAnyDevice.openSetup');
  assert.equal(controller.panel, firstPanel);
  assert.match(firstPanel.webview.html, /default-src 'none'/);

  await controller.store.saveBot('123456789', 'synthetic-host-secret');
  await controller.store.saveSender('synthetic_host_sender');
  const folder = vscode.workspace.workspaceFolders[0];
  await controller.store.saveProject({ name: folder.name, path: await fs.realpath(folder.uri.fsPath) });
  await controller.refresh();
  const model = await controller.model();
  assert.equal(model.complete, true);
  assert.equal(model.direct.paired, false);
  assert.doesNotMatch(JSON.stringify(model), /synthetic-host-secret/);
  await controller.act('preview');
  const preview = vscode.window.activeTextEditor.document.getText();
  assert.equal(JSON.parse(preview).mode, 'direct');
  assert.equal(JSON.parse(preview).phoneConnection, 'requiresExplicitConnectionAndPairing');
  assert.equal(JSON.parse(preview).plannedAuthorization.approvalLocation, 'desktop');
  assert.doesNotMatch(preview, /synthetic-host-secret/);
  await controller.openDocument('docs/setup.md');
  assert.match(vscode.window.activeTextEditor.document.getText(), /0\.4\.0/);
  const { DirectController } = require(path.join(extension.extensionPath, 'extension/lib/direct-controller'));
  controller.direct.data.last = { id: 'aaaaaaaaaaaa', status: 'unknown', error: 'codexProtocol', phase: 'phaseTurn' };
  await controller.direct.persist();
  const restored = new DirectController(vscode, controller.context, controller.store, controller.t);
  assert.equal(restored.snapshot().error, 'codexProtocol'); assert.equal(restored.snapshot().phase, 'phaseTurn');
  assert.match(restored.taskStatus(), /protocol/); await restored.disconnect();
  await controller.refresh();
  controller.direct.output = 'Synthetic latest agent output';
  await controller.act('showResult');
  assert.equal(vscode.window.activeTextEditor.document.getText(), 'Synthetic latest agent output');
  await controller.direct.clear();
  await controller.store.clear();
  assert.equal((await controller.model()).complete, false);
  await controller.act('identityGuide');
  assert.equal(path.basename(vscode.window.activeTextEditor.document.uri.fsPath), 'qq-identity.md');
  assert.match(vscode.window.activeTextEditor.document.getText(), /author\.user_openid/);
  assert.equal((await controller.model()).complete, false);
  const { checkEnvironment } = require(path.join(extension.extensionPath, 'extension/lib/runtime'));
  controller.environment = await checkEnvironment({ platform: 'linux', env: { PATH: '/synthetic' },
    exists: () => true, run: async (_spec, args) => args[0] === '--version'
      ? { code: 0, stdout: 'codex-cli 0.162.0-alpha.17.2' }
      : { code: 0, stderr: 'Logged in using an API key - synthetic-host-api-secret' } });
  const authModel = await controller.model();
  assert.equal(authModel.environment.codex.login, 'apiKey');
  assert.doesNotMatch(JSON.stringify(authModel), /synthetic-host-api-secret/);
  await controller.refresh();
  controller.panel.reveal();
  if (process.env.ANYDEVICE_HOST_LAYOUT_GATE) {
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    await vscode.commands.executeCommand('workbench.action.closePanel');
    await fs.writeFile(process.env.ANYDEVICE_HOST_LAYOUT_READY, 'ready');
    const deadline = Date.now() + 60000;
    while (true) {
      try { await fs.access(process.env.ANYDEVICE_HOST_LAYOUT_GATE); break; } catch { /* Wait for external layout inspection. */ }
      assert.ok(Date.now() < deadline, 'Layout inspection completed within one minute');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  await fs.writeFile(process.env.ANYDEVICE_HOST_REPORT, JSON.stringify({
    passed: 13, checks: ['real activation', 'commands', 'one webview and CSP',
      'SecretStorage and metadata', 'secret-free preview', 'bundled guide', 'clear state',
      'bundled identity guide without credentials', 'synthetic API authentication summary',
      'direct commands without automatic connection', 'manual metadata without verified pairing', 'explicit latest result document',
      'allowlisted task diagnosis loaded from real globalState without a connection'],
  }, null, 2));
}

module.exports = { run };
