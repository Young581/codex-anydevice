'use strict';

const vscode = require('vscode');
const { SetupController } = require('./lib/setup-controller');
const { strings } = require('./lib/strings');

function activate(context) {
  const controller = new SetupController(vscode, context);
  const t = strings(vscode.env.language);
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  status.text = '$(device-mobile) Codex AnyDevice';
  status.command = 'codexAnyDevice.openSetup';
  status.tooltip = t.statusTitle;
  status.show();
  context.subscriptions.push(
    controller, status,
    vscode.commands.registerCommand('codexAnyDevice.openSetup', () => controller.open()),
    vscode.commands.registerCommand('codexAnyDevice.checkEnvironment', async () => {
      await controller.open();
      await controller.act('check');
    }),
    vscode.commands.registerCommand('codexAnyDevice.openResearch', async () => {
      const uri = vscode.Uri.joinPath(context.extensionUri, 'docs', 'research.md');
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, { preview: true });
    }),
    vscode.commands.registerCommand('codexAnyDevice.showStatus', async () => {
      const model = await controller.model();
      return vscode.window.showInformationMessage(model.complete ? t.noPhoneYet : `${t.preparing} · ${model.completed}/3`);
    })
  );
  return { controller };
}

module.exports = { activate };
