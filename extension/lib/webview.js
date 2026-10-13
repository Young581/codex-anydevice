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
  <section><div class="heading"><span class="number">1</span><div><h2 id="environmentTitle"></h2><p id="environmentBody"></p></div></div>
    <div id="runtime" class="runtime" aria-live="polite"></div>
    <p id="authNote" class="small"></p>
    <div class="actions"><button data-action="check" id="check"></button><button data-action="installGuide" id="install" class="secondary"></button></div>
    <details><summary id="pathsLabel"></summary><div class="actions"><button data-action="chooseCodex" id="codexPath" class="secondary"></button></div></details>
  </section>
  <section><div class="heading"><span class="number">2</span><div><h2 id="qqTitle"></h2><p id="qqBody"></p></div></div>
    <div class="facts"><span id="botState"></span><span id="identityState"></span></div><p id="secretNote" class="small"></p>
    <p id="identityNote" class="small"></p>
    <div class="actions"><button data-action="credentials" id="credentials"></button><button data-action="identityGuide" id="identityGuide" class="secondary"></button><button data-action="createBot" id="createBot" class="secondary"></button></div>
    <details><summary id="identityAdvanced"></summary><div class="actions"><button data-action="identity" id="identity" class="secondary"></button></div></details>
  </section>
  <section><div class="heading"><span class="number">3</span><div><h2 id="projectTitle"></h2><p id="projectBody"></p></div></div>
    <div class="project"><strong id="projectName"></strong><p id="projectPath" class="small"></p></div>
    <button data-action="selectProject" id="selectProject"></button>
  </section>
  <section><h2 id="finishTitle"></h2><p id="finishBody"></p>
    <div class="actions"><button data-action="preview" id="preview" class="secondary"></button><button data-action="guide" id="guide" class="secondary"></button></div>
  </section>
  <footer><p id="boundary" class="small"></p><p id="notice" role="status"></p><button data-action="clear" id="clear" class="text-button"></button></footer>
</main><script nonce="${nonce}" src="${script}"></script></body></html>`;
}

module.exports = { render };
