#!/usr/bin/env node
'use strict';

// No build dependencies: the editable edition and the standalone use the same code.
const fs = require('node:fs');
const path = require('node:path');

const sourceRoot = path.resolve(__dirname, '..');
const outputPath = path.resolve(sourceRoot, '..', 'MetroMind AI 3D.html');
const normalize = value => value.replace(/\r\n?/g, '\n');
const isRemote = value => /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value);

function readLocalAsset(reference) {
  // Keep the standalone builder scoped to this edition, including symlink targets.
  if (/[?#]/.test(reference)) throw new Error(`Local asset URLs must not contain query strings or fragments: ${reference}`);
  const requestedPath = path.resolve(sourceRoot, reference);
  const resolvedPath = fs.realpathSync(requestedPath);
  const relative = path.relative(fs.realpathSync(sourceRoot), resolvedPath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Asset is outside the 3d source directory: ${reference}`);
  }
  return normalize(fs.readFileSync(resolvedPath, 'utf8')).trimEnd();
}

function buildStandalone() {
  let html = normalize(fs.readFileSync(path.join(sourceRoot, 'index.html'), 'utf8'));
  let styles = 0;
  let scripts = 0;

  html = html.replace(/<link\b[^>]*>/gi, tag => {
    const href = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(tag);
    const rel = /\brel\s*=\s*(["'])(.*?)\1/i.exec(tag);
    if (!href || !rel || !rel[2].split(/\s+/).includes('stylesheet') || isRemote(href[2])) return tag;
    styles++;
    const css = readLocalAsset(href[2]).replace(/<\/style/gi, '<\\/style');
    const media = /\bmedia\s*=\s*(["'])(.*?)\1/i.exec(tag);
    return `<style${media ? ` media=${media[1]}${media[2]}${media[1]}` : ''}>\n${css}\n</style>`;
  });

  html = html.replace(/<script\b([^>]*)>\s*<\/script\s*>/gi, (tag, attributes) => {
    const src = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(attributes);
    if (!src || isRemote(src[2])) return tag;
    scripts++;
    // HTML parsers terminate raw-text script elements even inside JS strings.
    const js = readLocalAsset(src[2]).replace(/<\/script/gi, '<\\/script');
    const inlineAttributes = attributes
      .replace(src[0], '')
      .replace(/\s+(?:integrity|crossorigin)\s*=\s*(["']).*?\1/gi, '')
      .trim();
    return `<script${inlineAttributes ? ` ${inlineAttributes}` : ''}>\n${js}\n</script>`;
  });

  if (!styles || !scripts) throw new Error('The 3d entry point must reference its local stylesheet and scripts.');
  const banner = '<!-- Generated from 3d/. Edit those sources, then run node 3d/scripts/build.cjs. -->';
  html = html.replace(/<!doctype html>/i, match => `${match}\n${banner}`);
  return html.endsWith('\n') ? html : `${html}\n`;
}

function checkStandalone() {
  return fs.existsSync(outputPath) && normalize(fs.readFileSync(outputPath, 'utf8')) === buildStandalone();
}

module.exports = { buildStandalone, checkStandalone, outputPath };

if (require.main === module) {
  try {
    const unknown = process.argv.slice(2).filter(value => value !== '--check');
    if (unknown.length) throw new Error(`Unknown argument: ${unknown.join(' ')}`);
    if (process.argv.includes('--check')) {
      if (checkStandalone()) {
        console.log('MetroMind AI 3D.html matches the 3d sources.');
      } else {
        console.error('MetroMind AI 3D.html is out of sync. Run node 3d/scripts/build.cjs.');
        process.exitCode = 1;
      }
    } else {
      const html = buildStandalone();
      fs.writeFileSync(outputPath, html, 'utf8');
      console.log(`Built MetroMind AI 3D.html (${Buffer.byteLength(html).toLocaleString('en-US')} bytes).`);
    }
  } catch (error) {
    console.error(`3D build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
