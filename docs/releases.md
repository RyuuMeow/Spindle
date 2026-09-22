# Release process

`version.json` is the product version authority. `pnpm version:sync` updates generated package metadata; `pnpm version:check` rejects divergence. Data, protocol and migration versions remain independent.

1. Add `releases/<version>/en.md`, `zh-TW.md`, `zh-CN.md`, each containing `## Features`.
2. Run typecheck, lint, unit/MCP/installer tests, translation checks and Web/desktop builds.
3. Build Windows x64 Portable and NSIS with `pnpm desktop:pack`.
4. Run `pnpm release:metadata` to generate language notes, exact asset identities and SHA-256 checksums.
5. Use the draft workflow. It uploads artifacts and downloads them again to verify hashes. It never publishes a release or changes repository visibility.
6. Validate final packages in isolated profiles and exercise actual update, rollback, restart, MCP and offline assets before marking the draft ready.

Windows signing uses optional `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD` secrets. Without them builds are unsigned. Do not embed GitHub credentials: production checks use only anonymous public stable releases.

Automatic checks run once per process, respect skipped versions and never download. Installation is explicit. NSIS uses electron-updater; Portable uses a separately launched Windows helper and keeps the previous executable. Every open renderer must finish its save handshake before restart. Failed preparation leaves all windows open.

Release metadata is fetched over GitHub HTTPS and names the expected architecture/type. Hashes verify download integrity; they are not publisher signatures. Private draft test credentials stay outside the product.
