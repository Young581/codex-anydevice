# Codex AnyDevice

[简体中文](README.md) · [Research](docs/research.md) · [Roadmap](docs/roadmap.md) · [Maintenance](docs/maintenance.md)

A planned VS Code extension for controlling local Codex work from a phone through QQ, WeChat and OpenClaw. Community project; not an official OpenAI, Tencent or Microsoft product.

**0.1.0 is a development scaffold.** It includes research, architecture, a roadmap, two extension commands, cross-platform CI and audited offline VSIX packaging. Mobile messaging, Codex execution, session handoff and remote approval are not implemented. No Marketplace release exists.

The first milestone is phone-initiated tasks with returned results. Existing conversation continuation, questions and approvals follow. Start by validating the official QQ bot channel through OpenClaw's native Codex integration; add WeChat after independently checking its version-specific access controls. Separate Codex processes must not write the same conversation concurrently.

Use Node 22+, Python 3.8+ and VS Code 1.96+. No npm dependencies are required:

```text
node scripts/check.js
node --test tests/extension.test.js
python -B tests/package_validation.py
python -B build.py --output dist
```

Press F5 in VS Code and run **Codex AnyDevice: Open research and development plan** or **Show development status**. They display documentation and scaffold status only.

Repository settings follow [Codex Beacon](https://github.com/Young581/codex-beacon): public MIT repository, `main`, bilingual documentation, issue forms, Windows/Linux/macOS CI, read-only workflow permissions, explicit package allowlists and SHA-256 checks. Detailed design documents currently use Chinese; command titles and status messages support English and Chinese.

[Contributing](CONTRIBUTING.md) · [Privacy](PRIVACY.md) · [Security](SECURITY.md) · [Release process](docs/releases.md) · [Verification](docs/verification.md)
