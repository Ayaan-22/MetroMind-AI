import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export const outputPath = resolve(root, '../MetroMind_AI_v11.html');
const normalize = text => text.replace(/\r\n/g, '\n');

export async function buildStandalone() {
  const [template, css, bundle] = await Promise.all([
    readFile(resolve(root, 'MetroMind_AI_v11.html'), 'utf8'),
    readFile(resolve(root, 'css/styles.css'), 'utf8'),
    build({
      absWorkingDir: root,
      entryPoints: ['js/main.js'],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      charset: 'utf8',
      write: false,
    }),
  ]);
  const styleTag = '<link rel="stylesheet" href="css/styles.css" />';
  const scriptTag = '<script type="module" src="js/main.js"></script>';
  if (!template.includes(styleTag) || !template.includes(scriptTag)) {
    throw new Error('The modular entry point must contain the expected stylesheet and script tags.');
  }
  return normalize(template)
    .replace('<!doctype html>', '<!doctype html>\n<!-- Generated from modular_version. Edit those sources, then run npm run build there. -->')
    .replace(styleTag, () => `<style>\n${normalize(css).trimEnd()}\n    </style>`)
    .replace(scriptTag, () => `<script>\n${normalize(bundle.outputFiles[0].text).trimEnd()}\n    </script>`);
}

export async function checkStandalone() {
  return normalize(await readFile(outputPath, 'utf8')) === await buildStandalone();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    if (!await checkStandalone()) {
      console.error('Standalone HTML is out of sync. Run npm run build in modular_version.');
      process.exitCode = 1;
    } else {
      console.log('Standalone HTML matches the modular HTML, CSS and JavaScript.');
    }
  } else {
    await writeFile(outputPath, await buildStandalone(), 'utf8');
    console.log('Built ../MetroMind_AI_v11.html from the modular sources.');
  }
}
