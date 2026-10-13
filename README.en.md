# Codex AnyDevice

[简体中文](README.md) · [Research](docs/research.md) · [Roadmap](docs/roadmap.md) · [Maintenance](docs/maintenance.md)

A planned VS Code extension for controlling local Codex work directly from QQ on a phone, with WeChat considered as a later independent channel. Community project; not an official OpenAI, Tencent or Microsoft product.

**0.2.1 prepares personal QQ direct access.** It checks Codex, saves bot credentials through native password input and SecretStorage, records one QQ identity, selects one project and previews a secret-free setup summary. Progress can be saved before creating a bot. OpenClaw checks, installation prompts and gateway-specific configuration and commands have been removed. QQ messaging and Codex task execution remain to be implemented. No Marketplace release exists.

The first milestone is phone-initiated tasks with returned results through **QQ official bot → AnyDevice → local Codex app-server**. The extension will own authentication, reconnection, authorization, deduplication and result delivery. The user flow does not depend on OpenClaw. QQ WebSocket access must be verified for the actual bot; Webhook access needs an HTTPS callback. Keep the computer and VS Code running. Existing conversation continuation, questions and approvals follow; separate Codex processes must not write the same conversation concurrently. See the [direct-access prototype](docs/qq-direct-poc.md).

Use Node 22+, Python 3.8+ and VS Code 1.96+. No npm dependencies are required:

```text
node scripts/check.js
node --test tests/extension.test.js tests/setup.test.js tests/runtime.test.js
python -B tests/package_validation.py
python -B build.py --output dist
```

Press F5 in VS Code, click **Codex AnyDevice** in the status bar, or run **Open personal QQ setup wizard**. The wizard supports both languages, editor themes and narrow layouts. Existing 0.2.0 setup data is retained. See [setup instructions](docs/setup.md). Complete setup details are distinct from verified phone connectivity.

Repository settings follow [Codex Beacon](https://github.com/Young581/codex-beacon): public MIT repository, `main`, bilingual documentation, issue forms, Windows/Linux/macOS CI, read-only workflow permissions, explicit package allowlists and SHA-256 checks. Detailed design documents currently use Chinese; command titles and status messages support English and Chinese.

[Contributing](CONTRIBUTING.md) · [Privacy](PRIVACY.md) · [Security](SECURITY.md) · [Release process](docs/releases.md) · [Verification](docs/verification.md)
