'use strict';

const vscode = require('vscode');

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codexAnyDevice.openResearch', async () => {
      const uri = vscode.Uri.joinPath(context.extensionUri, 'docs', 'research.md');
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, { preview: true });
    }),
    vscode.commands.registerCommand('codexAnyDevice.showStatus', () => {
      const message = vscode.env.language.toLowerCase().startsWith('zh')
        ? 'Codex AnyDevice 当前为研发骨架。下一阶段：从手机发起任务，并回传执行结果。'
        : 'Codex AnyDevice is a development scaffold. Next: start tasks from a phone and return results.';
      return vscode.window.showInformationMessage(message);
    })
  );
}

module.exports = { activate };
