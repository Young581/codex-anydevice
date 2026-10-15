'use strict';

const { randomBytes } = require('node:crypto');

function render(webview, extensionUri, vscode) {
  const nonce = randomBytes(24).toString('base64');
  const css = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'extension', 'assets', 'setup.css'));
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'extension', 'assets', 'setup.js'));
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}"><title>Codex AnyDevice</title></head>
<body><main>
  <header><div class="eyebrow">CODEX ANYDEVICE</div><h1 id="title"></h1><p id="subtitle"></p>
    <div class="progress"><span id="stage"></span><span id="progress"></span></div></header>
  <section><div class="heading"><span class="number">1</span><div><h2 id="qqTitle"></h2><p id="qqBody"></p></div></div>
    <div class="facts"><span id="botState"></span><span id="identityState"></span></div>
    <div class="actions"><button data-action="credentials" id="credentials"></button><button data-action="createBot" id="createBot" class="secondary"></button></div>
    <h3 id="projectTitle"></h3>
    <div class="project"><strong id="projectName"></strong><p id="projectPath" class="small"></p></div>
    <div class="actions"><button data-action="selectProject" id="selectProject"></button><button data-action="authorizeProject" id="authorizeProject" class="secondary"></button><button data-action="removeProject" id="removeProject" class="secondary"></button></div>
    <p id="projectCount" class="small"></p>
    <p id="projectBody" class="small"></p>
  </section>
  <section><div class="heading"><span class="number">2</span><div><h2 id="syncTitle"></h2><p id="syncBody"></p></div></div>
    <p id="syncState" role="status"></p>
    <div class="actions"><button data-action="enableSync" id="enableSync"></button><button data-action="disableSync" id="disableSync" class="secondary"></button></div>
  </section>
  <section><div class="heading"><span class="number">3</span><div><h2 id="directTitle"></h2><p id="directBody"></p></div></div>
    <div class="facts" aria-live="polite"><span id="connectionState"></span><span id="pairState"></span></div>
    <div class="actions"><button data-action="connect" id="connect"></button><button data-action="pair" id="pair"></button><button data-action="trustIdentity" id="trustIdentity" class="secondary"></button><button data-action="disconnect" id="disconnect" class="secondary"></button><button data-action="forgetPairing" id="forgetPairing" class="secondary"></button></div>
    <div id="pairBox" hidden><p id="pairInstruction" class="small"></p><pre id="pairingCode"></pre></div>
    <p id="phoneCommands" class="small"></p>
    <div class="actions"><button data-action="commandButtons" id="commandButtons" class="secondary"></button></div>
    <p id="commandButtonsNote" class="small"></p><p id="commandButtonsState" role="status"></p>
    <h3 id="conversationTitle"></h3>
    <p id="conversationState" role="status"></p><button data-action="selectConversation" id="selectConversation" class="secondary"></button>
    <div class="actions"><button data-action="viewHistory" id="viewHistory" class="secondary"></button><button data-action="nextHistory" id="nextHistory" class="secondary"></button></div>
    <div class="actions"><button data-action="openThread" id="openThread"></button></div>
    <h3 id="taskTitle"></h3><p id="taskState" role="status"></p>
    <p id="directError" role="status"></p><p id="deliveryState" class="small"></p>
    <p id="sandboxState" class="small"></p>
    <div class="actions"><button data-action="cancel" id="cancel" class="secondary"></button><button data-action="showResult" id="showResult" class="secondary"></button></div>
  </section>
  <footer><p id="boundary" class="small"></p><p id="notice" role="status"></p><button data-action="guide" id="guide" class="text-button"></button></footer>
</main><script nonce="${nonce}" src="${script}"></script></body></html>`;
}

module.exports = { render };
