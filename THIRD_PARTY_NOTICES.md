# Third-party software and resources

Spindle source is GPL-3.0-only. Dependency copyrights and licenses remain with their owners. Packaging copies notices into `licenses/`; the pnpm lockfile records exact dependencies.

| Component | License | Source |
|---|---|---|
| Electron | MIT and bundled Chromium/Node notices | https://github.com/electron/electron |
| React / React DOM | MIT | https://github.com/facebook/react |
| Monaco Editor | MIT | https://github.com/microsoft/monaco-editor |
| CodeMirror | MIT | https://github.com/codemirror |
| React Flow | MIT | https://github.com/xyflow/xyflow |
| ELK / elkjs | EPL-2.0 OR GPL-3.0-or-later | https://github.com/kieler/elkjs |
| libavoid-js / libavoid | LGPL-2.1-or-later | https://github.com/Aksem/libavoid-js / https://github.com/mjwybrow/adaptagrams |
| MCP TypeScript SDK | MIT | https://github.com/modelcontextprotocol/typescript-sdk |
| electron-updater | MIT | https://github.com/electron-userland/electron-builder |
| OpenCC dictionaries/converter | Apache-2.0 / MIT (see package) | https://github.com/nk2028/opencc-js |

The app logo is maintained in `public/brand/` as part of Spindle. No proprietary font is bundled; system fonts are queried locally. Screenshots use a separate fictional demonstration project and are not initial app data.

Build instructions and exact package versions are supplied with the source archive. The libavoid WASM is loaded as a separate asset; its upstream build tooling and corresponding source must accompany binary distribution. Do not remove its LGPL notices or prevent replacing the library. The release checklist requires source and rebuilding materials before a draft is marked ready.

Pinned corresponding source archives for elkjs, ELK, libavoid-js and its adaptagrams 1.0.5 fork are listed with SHA-256 in `third-party-sources.json`. Run `node scripts/third-party-sources.mjs` to retrieve verified release attachments. libavoid-js includes `tools/generate.py` (Emscripten 4.0.7) and `build.js`; place the included adaptagrams source at its `build/adaptagrams` location before rebuilding. ELK/elkjs include their Gradle and JavaScript build scripts.
