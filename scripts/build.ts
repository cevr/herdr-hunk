import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = join(scriptDirectory, '..');
const packageJson: unknown = JSON.parse(readFileSync(join(rootDirectory, 'package.json'), 'utf8'));

if (
  typeof packageJson !== 'object' ||
  packageJson === null ||
  !('version' in packageJson) ||
  typeof packageJson.version !== 'string'
) {
  throw new Error('package.json must contain a version.');
}

const binDirectory = join(rootDirectory, 'bin');
mkdirSync(binDirectory, { recursive: true });

const targetPlatform =
  process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'windows' : 'linux';
const targetArchitecture = process.arch === 'arm64' ? 'arm64' : 'x64';

const result = await Bun.build({
  entrypoints: [join(rootDirectory, 'src/main.ts')],
  target: 'bun',
  define: {
    __VERSION__: JSON.stringify(packageJson.version),
    __ASSET_ROOT__: JSON.stringify(rootDirectory),
  },
  compile: {
    target: `bun-${targetPlatform}-${targetArchitecture}`,
    outfile: join(binDirectory, 'herdr-hunk'),
    autoloadBunfig: false,
  },
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
