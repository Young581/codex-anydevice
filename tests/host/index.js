'use strict';

const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function run() {
  const extension = vscode.extensions.getExtension('Young581.codex-anydevice');
  assert.ok(extension, 'Extension is installed in the isolated host');
  assert.equal(extension.packageJSON.version, '0.6.2');
  assert.equal(extension.packageJSON.contributes.configuration.properties['codexAnyDevice.openclawPath'], undefined);
  if (process.env.ANYDEVICE_HOST_EXPECT_EXTENSION_PATH) {
    assert.equal(await fs.realpath(extension.extensionPath),
      await fs.realpath(process.env.ANYDEVICE_HOST_EXPECT_EXTENSION_PATH));
  }
  const api = await extension.activate();
  const controller = api.controller;
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('codexAnyDevice.openSetup'));
  for (const command of extension.packageJSON.contributes.commands) assert.ok(commands.includes(command.command));
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
  await vscode.commands.executeCommand('codexAnyDevice.previewConfiguration');
  const preview = vscode.window.activeTextEditor.document.getText();
  assert.equal(JSON.parse(preview).mode, 'direct');
  assert.equal(JSON.parse(preview).phoneConnection, 'requiresExplicitConnectionAndPairing');
  assert.equal(JSON.parse(preview).plannedAuthorization.approvalLocation, 'desktop');
  assert.doesNotMatch(preview, /synthetic-host-secret/);
  await vscode.commands.executeCommand('codexAnyDevice.openGuide');
  assert.match(vscode.window.activeTextEditor.document.getText(), /0\.6\.2/);
  const { DirectController } = require(path.join(extension.extensionPath, 'extension/lib/direct-controller'));
  controller.direct.data.last = { id: 'aaaaaaaaaaaa', status: 'unknown', error: 'codexProtocol', phase: 'phaseTurn' };
  await controller.direct.persist();
  const restored = new DirectController(vscode, controller.context, controller.store, controller.t);
  assert.equal(restored.snapshot().error, 'codexProtocol'); assert.equal(restored.snapshot().phase, 'phaseTurn');
  assert.match(restored.taskStatus(), /protocol/); await restored.disconnect();
  // Synthetic grant storage only; never dismiss or click a real approval dialog.
  await controller.store.confirmSender('synthetic_host_sender');
  const threadId = '11111111-1111-1111-1111-111111111111';
  await controller.store.saveConversation(threadId);
  const firstProject = controller.store.read().project;
  const secondPath = path.join(path.dirname(firstProject.path), 'second-project'); await fs.mkdir(secondPath, { recursive: true });
  const secondProject = { name: 'Second synthetic project', path: await fs.realpath(secondPath) };
  const secondThread = '22222222-2222-4222-8222-222222222222';
  await controller.store.saveProject(secondProject); await controller.store.authorizeProject(); await controller.store.saveConversation(secondThread);
  await controller.store.switchProject(firstProject.path);
  const { SetupStore } = require(path.join(extension.extensionPath, 'extension/lib/setup-model'));
  const { EventEmitter } = require('node:events');
  const qq = new EventEmitter(); qq.start = async () => qq.emit('state', 'connected'); qq.stop = () => qq.emit('state', 'disconnected');
  const remembered = new DirectController(vscode, controller.context, new SetupStore(controller.context), controller.t,
    { qq, reserve: async () => async () => {} });
  await remembered.connect({ file: '/synthetic/codex', prefix: [] });
  assert.equal(remembered.snapshot().paired, true); assert.equal(remembered.snapshot().pairingCode, undefined);
  assert.equal(remembered.latestThread, threadId);
  await remembered.switchProject(secondProject.path);
  assert.equal(remembered.latestThread, secondThread); assert.equal(remembered.snapshot().paired, true);
  await remembered.switchProject(firstProject.path); assert.equal(remembered.latestThread, threadId);
  await controller.store.removeProject(secondProject.path); assert.equal(controller.store.read().projects.length, 1);
  await remembered.forgetPairing();
  assert.equal(controller.store.read().confirmedSender, undefined); assert.equal(controller.store.read().conversationId, undefined);
  await controller.refresh();
  controller.direct.output = 'Synthetic latest agent output';
  await controller.act('showResult');
  assert.equal(vscode.window.activeTextEditor.document.getText(), 'Synthetic latest agent output');
  const readHistory = controller.direct.readHistory;
  controller.direct.readHistory = async (_id, next) => ({ text: next ? 'Synthetic older dialogue' : 'Synthetic dialogue page', next: next ? null : { cursor: 'older', offset: 0 } });
  await controller.act('viewHistory'); assert.match(vscode.window.activeTextEditor.document.getText(), /Synthetic dialogue page/);
  await controller.act('nextHistory'); assert.match(vscode.window.activeTextEditor.document.getText(), /Synthetic older dialogue/);
  controller.direct.readHistory = readHistory;
  await controller.act('commandButtons'); assert.equal((await controller.model()).commandButtons, true);
  await controller.act('commandButtons'); assert.equal((await controller.model()).commandButtons, false);
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
  controller.check = async () => authModel.environment;
  await vscode.commands.executeCommand('codexAnyDevice.checkEnvironment');
  const diagnosis = vscode.window.activeTextEditor.document.getText();
  assert.ok(diagnosis.includes(controller.t.apiKey));
  assert.doesNotMatch(diagnosis, /synthetic-host-api-secret/);
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
    passed: 18, checks: ['real activation', 'commands', 'one webview and CSP',
      'SecretStorage and metadata', 'secret-free preview', 'bundled guide', 'clear state',
      'bundled identity guide without credentials', 'synthetic API authentication summary',
      'direct commands without automatic connection', 'manual metadata without verified pairing', 'explicit latest result document',
      'allowlisted task diagnosis loaded from real globalState without a connection',
      'confirmed synthetic QQ identity and target restored from globalState without a pairing code',
      'forget pairing clears persistent grant and continuation target',
      'multiple synthetic folder grants and targets persist and switch without re-pairing',
      'history actions open unsaved dialogue pages', 'optional command-button settings toggle in isolated profile'],
  }, null, 2));
}

module.exports = { run };
