import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env };
// Reuse verified local tools when present; clean checkouts use builder's downloader.
for (const [variable, directory, marker] of [
  ['ELECTRON_BUILDER_NSIS_DIR', 'nsis', 'makensis.exe'],
  ['ELECTRON_BUILDER_NSIS_RESOURCES_DIR', 'nsis-resources', 'plugins'],
]) {
  const location = new URL(`../.sites-runtime/${directory}/`, import.meta.url);
  if (!env[variable] && existsSync(new URL(marker, location))) env[variable] = fileURLToPath(location);
}
const portableOnly = process.argv.includes('--portable-only');
const result = spawnSync(process.execPath, [
  'node_modules/electron-builder/cli.js', '--config', 'desktop/electron-builder.json',
  '--win', ...(portableOnly ? ['portable'] : []), '--x64', '--publish', 'never',
  ...process.argv.slice(2).filter(arg => arg !== '--portable-only'),
], { cwd: root, env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
