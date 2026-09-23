# Spindle 0.10.0 public-release verification

Environment: Windows x64, Node.js 22.23.2, pnpm 11.25.0, 24 September 2026. Verification used an isolated checkout and profile. Release binaries are unsigned; the SHA-256 manifest checks file integrity, not publisher identity.

## Local results

| Check | Result |
| --- | --- |
| Fresh checkout, `pnpm install --frozen-lockfile` | Passed; no local hosting configuration or build cache required. |
| `pnpm version:check`, `pnpm i18n:check`, `pnpm demo:check` | Passed; 1,024 matching message keys in English, Traditional Chinese and Simplified Chinese; demo fixture matches the copyable example project. |
| `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm desktop:stage` | Passed. |
| `pnpm test:unit`, `pnpm test:mcp`, `pnpm test:agent-installation`, `pnpm test:release` | Passed: 192 unit, 25 MCP, 12 agent installation and 6 release tests. One isolated MCP loopback request timed out on the first run; its unchanged rerun passed. |
| `pnpm desktop:pack`; `pnpm test:public-ui` against staged desktop and packaged Portable | Passed; both Windows x64 Portable and NSIS files were built. The UI suite passed in all three languages in both environments. |
| `pnpm test:portable-launch` against packaged Portable | Passed: clean profile has no demo, a copied example project opens, independent instances have separate extraction directories, closing one preserves the other, and a repeated launch restores the existing window. |
| `node scripts/test-portable-update.cjs` | Passed with normal Windows app permissions: replaced an isolated 0.9.2 Portable, retained the original filename and previous-executable backup, completed new renderer readiness handshake, and preserved saved content. The first sandboxed attempt could not attach to the old binary's debugger and made no replacement. |
| Package resource audit | Passed: offline MCP/Skill, routing Worker/WASM, font and update resources are present; no demo project, test profile, credential, local private path, or example story is bundled. |
| README/docs links | Passed: 33 Markdown files checked; no broken local links. Three-language README and current guide links were inspected. |

The new public tag's exact artifact hashes are in `SHA256SUMS-0.10.0.txt`, distributed with the release. The public source archive is generated from that tag. The private archive retains the original signed merge commit and old 0.10.0 assets; those are not reused for the public release.

## CI and remaining coverage

GitHub Actions triggers remain configured for PRs, pushes and release tags. Existing hosted jobs did not start because the account reported a billing/spending-limit restriction; no runner steps executed, and this report does not count them as passes. `main` does not require that check until hosted CI can run again.

End-to-end NSIS `electron-updater` installation and restart on a clean Windows account were not exercised. The complete Portable download-to-install UI, rollback after a newly launched binary fails, locked target files, and restricted write permissions also remain untested. Native IME, mixed DPI, multi-monitor, and real concurrent-window restart combinations need additional device coverage. Actual Codex and Claude Code client loading was unavailable in the isolated environment; MCP protocol, installation service and packaged offline resources were tested separately.

Anonymous access to the published README, documentation, source, release files and update endpoint must be verified after the new repository and release become public. The old private repository's CI and release status do not attest to the new artifacts.
