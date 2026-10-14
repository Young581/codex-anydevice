# Codex AnyDevice

[简体中文](README.md) · [Setup](docs/setup.md) · [Research](docs/research.md) · [Maintenance](docs/maintenance.md)

Start local Codex tasks from your phone through an official QQ bot. Choose one project, pair your QQ and review Codex approvals in VS Code. For personal use; no OpenClaw dependency. Community project, not an official OpenAI, Tencent or Microsoft product.

**0.3.0 is an official QQ WebSocket prototype.** It implements connection, one-time pairing codes with desktop confirmation, `/new`, `/status`, `/cancel`, result delivery and desktop approvals. Synthetic validation is separate from actual bot eligibility, phone messaging and model execution, which still need acceptance. No Marketplace or formal Release publication exists.

Save bot credentials using the native password box and SecretStorage, select a trusted local project, then click **Connect QQ**. Once connected, click **Start pairing**, send the displayed `/pair CODE` in your own QQ private chat and confirm on the computer. OpenID is obtained automatically; manually recorded metadata does not authorize tasks. Send `/new Read README and summarize the project without modifying files` for the first synthetic-project smoke test. Use `/status` and `/cancel`; native approval requests stay on the computer.

Keep the computer and VS Code running. Reconnect and pair after a restart or explicit disconnect. No tasks replay automatically. Only one bot owner, sender, project and active task are supported. Group chat, Webhook, multiple shards, WeChat and existing conversation continuation are not implemented.

Verified Codex version: **0.162.0-alpha.17.2**. Other versions fail closed. Tasks inherit the selected CLI authentication, model and provider; ChatGPT and API keys are supported by Codex and API usage may incur charges. AnyDevice does not read or modify Codex login/configuration files. Custom provider and real model execution need separate acceptance. If native Windows Codex returns a read-only sandbox, the task preserves it and shows a notice; configure sandboxing in official Codex for project writes. Requested approvals require explicit desktop responses. Project selection is not a read-access boundary.

Only the latest bounded agent output stays in memory (20,000 characters); QQ receives a summary. Replies conservatively expire after 5 minutes, with at most four per source message. For longer tasks, use `/status` and desktop results. See [architecture](docs/architecture.md) and [privacy](PRIVACY.md).

Development requires Node 22+ and Python 3.8+ without npm dependencies. QQ needs a recent VS Code host with native fetch/WebSocket; this round uses VS Code 1.141.0.

```text
node scripts/check.js
node --test tests/extension.test.js tests/setup.test.js tests/runtime.test.js tests/direct.test.js
python -B tests/package_validation.py
python -B build.py --output dist
```

Existing 0.2.x setup data is retained. Repository settings, CI, allowlists and audited release maintenance follow [Codex Beacon](https://github.com/Young581/codex-beacon). CI is not proof of device operation or public release.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Release process](docs/releases.md) · [Verification](docs/verification.md)
