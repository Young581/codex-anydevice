# Codex AnyDevice

[简体中文](README.md) · [Setup](docs/setup.md) · [Research](docs/research.md) · [Maintenance](docs/maintenance.md)

Start local Codex tasks from your phone through an official QQ bot. Choose one project, pair your QQ and review Codex approvals in VS Code. For personal use; no OpenClaw dependency. Community project, not an official OpenAI, Tencent or Microsoft product.

**0.6.2 is distributed through public GitHub Releases.** [Download the VSIX](https://github.com/Young581/codex-anydevice/releases/latest). The management panel keeps everyday configuration, projects, connections and conversations. Up to 20 folders retain separate grants and continuation targets; paged history and optional QQ input buttons are available. Pair once with desktop confirmation. Actual bot eligibility, phone messaging and real model execution still need acceptance. Not yet listed on VS Code Marketplace.

If official Codex fails after enabling sync, restore its original entry in AnyDevice and reload. After installing 0.6.2, use **Update official sync entry** and reload to replace the generated proxy. The large desktop history fix from 0.4.1 is retained.

Save bot credentials using the native password box and SecretStorage, select a trusted local project, then click **Connect QQ**. Connecting checks the environment and creates a pairing code automatically. Send `/pair CODE` from your own QQ and confirm identity and project authorization once on the computer. OpenID is obtained automatically; manually recorded metadata does not authorize tasks. Send `/new Read README and summarize the project without modifying files` for the first synthetic-project smoke test. Use `/status` and `/cancel`; native approval requests stay on the computer.

Keep the computer and VS Code running. Click Connect after a restart; no new pairing is needed and no tasks replay automatically. New folders need desktop authorization; switching among authorized folders does not. Changing bot or manually changing identity, or **Forget QQ pairing**, revokes every project grant. Group chat, Webhook, multiple shards and WeChat are not implemented.

Enable official sync for continuation and history: `/sessions` lists 10 current-project conversations per page, `/sessions next` shows older threads, `/use 1` selects one, and `/continue MESSAGE` resumes the original idle thread. `/history [NUMBER]` displays dialogue without changing the target; `/history next` pages through it (1400 characters per page, latest turns first). Tools, reasoning, attachments and raw history files are not forwarded. The desktop offers history controls too. Busy continuation targets and other projects are refused.

Send `/help`, `/` or `/c` for command hints. If your bot has QQ custom-button permission, enable **QQ command input buttons** under Connection and pairing in the management panel; clicking fills input without sending. Live suggestions while typing belong to the QQ client. Explicit button rejection falls back to text; uncertain sends are not retried.

Verified Codex version: **0.162.0-alpha.17.2**. Other versions fail closed. Tasks inherit the selected CLI authentication, model and provider; ChatGPT and API keys are supported by Codex and API usage may incur charges. AnyDevice does not read or modify Codex login/configuration files. Custom provider and real model execution need separate acceptance. If native Windows Codex returns a read-only sandbox, the task preserves it and shows a notice; configure sandboxing in official Codex for project writes. Requested approvals require explicit desktop responses. Project selection is not a read-access boundary.

Only the latest bounded agent output stays in memory (20,000 characters); QQ receives a summary. Replies conservatively expire after 5 minutes, with at most four per source message. For longer tasks, use `/status` and desktop results. See [architecture](docs/architecture.md) and [privacy](PRIVACY.md).

Development requires Node 22+ and Python 3.8+ without npm dependencies. QQ needs a recent VS Code host with native fetch/WebSocket; this round uses VS Code 1.141.0.

```text
node scripts/check.js
node --test tests/extension.test.js tests/setup.test.js tests/runtime.test.js tests/direct.test.js
python -B tests/package_validation.py
python -B build.py --output dist
```

Completed changes receive a new version and are committed and pushed. After cross-platform CI succeeds, main pushes create the version tag and upload an official-vsce draft release; the same package is audited and checked in an isolated host before publication. Existing tags and assets are immutable. Actions remain read-only by default; the release job alone has contents-write permission. Repository governance follows [Codex Beacon](https://github.com/Young581/codex-beacon). CI does not prove actual phone or model operation.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Release process](docs/releases.md) · [Verification](docs/verification.md)
