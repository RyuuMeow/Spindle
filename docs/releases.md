[English](releases.md) · [繁體中文](releases.zh-TW.md) · [简体中文](releases.zh-CN.md)

# Release process

`version.json` is the only manually edited product version. `pnpm version:sync` updates package metadata and `pnpm version:check` rejects divergence. Data, protocol and migration schema versions are independent. Each `releases/<version>/` directory contains `en.md`, `zh-TW.md`, `zh-CN.md` (each with `## Features`) and a verification report. Release metadata generates the GitHub notes and app update descriptions from these files.

## Local validation and Windows artifacts

1. Use a clean checkout with Node.js 22.22.0, pnpm 11.25.0 and `pnpm install --frozen-lockfile`. Run `pnpm demo:check`, `pnpm version:check`, `pnpm i18n:check`, TypeScript, lint, unit/MCP/installer/release tests, then Web and desktop builds. Record exact commands, platform and results in the verification report.
2. Run `pnpm desktop:pack` to build Windows x64 Portable and NSIS. Inspect the final packages: bundled licenses, offline MCP, Worker/WASM, language resources, no demo bootstrap, profile, credential or test output.
3. Add the final source archive from the tagged commit, verification report, LICENSE, third-party notices and required third-party source archives. Run `pnpm release:metadata` and check `SHA256SUMS-<version>.txt`, `latest.yml`, update metadata, asset filenames and tag agree.
4. Use an isolated profile to verify launcher, demo project copy/open, custom commands, Portable restart/replacement and recovery. Test NSIS and actual update flows where a clean Windows environment is available. Report untested IME, DPI, multi-window, locking or permissions cases explicitly.

Windows signing is optional through `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD`. Without a signing certificate, builds are **unsigned**. SHA-256 checks integrity, not publisher identity.

## GitHub workflow and publication

`.github/workflows/verify.yml` runs on PR and main pushes; `release.yml` runs on version tags or manually and creates a **draft** Release with downloadable hash verification. Its Release-writing permission is limited to the publication job. A failed-to-start Actions run caused by account billing/quota is not a test result. Until quota returns, run and record the full local suite and do not require that check on main; retain the triggers for later recovery.

For the 0.10.0 public cut, the original private repository is renamed to `Spindle-private-archive`. A new `RyuuMeow/Spindle` begins private with only the sanitized main history and a newly created `v0.10.0` tag. Back up old refs and assets first. Never rely on GitHub's old-name redirect after reusing the name. Rebuild and upload all new-tag assets, download them back, verify hashes and inspect source/package contents **before** switching visibility. If any pre-public check fails, leave the new repo private and Release as a draft. After publication, verify README, docs, source and downloads without a GitHub credential; protect main against deletion and force pushes, then archive the old private repository read-only. Old 0.10.0 private testers need a manual same-version installation.

## Update boundaries

Spindle checks at most once per process for newer **public stable** releases, respecting skipped versions; it never auto-downloads. The user must choose installation. Every open renderer finishes its save handshake before the app exits. NSIS uses electron-updater; Portable launches a separate Windows helper, keeps a previous executable backup and verifies the new start. An update is limited to the configured repository, compatible platform/architecture/type, version and verified hash. Failure to prepare or launch keeps or restores the existing app; do not present download-only success as an end-to-end installation test. No private GitHub credential is embedded in the product.
