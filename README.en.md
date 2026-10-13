# Codex AnyDevice

[简体中文](README.md) · [Research](docs/research.md) · [Roadmap](docs/roadmap.md) · [Maintenance](docs/maintenance.md)

A planned VS Code extension for controlling local Codex work from a phone through QQ, WeChat and OpenClaw. Community project; not an official OpenAI, Tencent or Microsoft product.

**0.2.0 is a personal QQ setup assistant.** It checks local tools and gateway reachability, saves bot credentials through native password input and SecretStorage, binds one QQ identity, selects one project, previews a secret-free configuration fragment and copies a phone binding command. Progress can be saved before creating a bot. It does not apply gateway configuration, start a gateway, send QQ messages or execute Codex tasks. No Marketplace release exists.

The first milestone is phone-initiated tasks with returned results. Existing conversation continuation, questions and approvals follow. Start by validating the official QQ bot channel through OpenClaw's native Codex integration; add WeChat after independently checking its version-specific access controls. Separate Codex processes must not write the same conversation concurrently.

Use Node 22+, Python 3.8+ and VS Code 1.96+. No npm dependencies are required:

```text
node scripts/check.js
node --test tests/extension.test.js tests/setup.test.js tests/runtime.test.js
python -B tests/package_validation.py
python -B build.py --output dist
```

Press F5 in VS Code, click **Codex AnyDevice** in the status bar, or run **Open personal QQ setup wizard**. The wizard supports both languages, editor themes and narrow layouts. See [setup instructions](docs/setup.md). Complete setup details and gateway reachability are distinct from verified phone connectivity.

Repository settings follow [Codex Beacon](https://github.com/Young581/codex-beacon): public MIT repository, `main`, bilingual documentation, issue forms, Windows/Linux/macOS CI, read-only workflow permissions, explicit package allowlists and SHA-256 checks. Detailed design documents currently use Chinese; command titles and status messages support English and Chinese.

[Contributing](CONTRIBUTING.md) · [Privacy](PRIVACY.md) · [Security](SECURITY.md) · [Release process](docs/releases.md) · [Verification](docs/verification.md)
