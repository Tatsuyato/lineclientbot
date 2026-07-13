#!/usr/bin/env node
/**
 * Fix CJS output - add package.json with { "type": "commonjs" } to dist/cjs
 */
const fs = require('fs');
const path = require('path');

const cjsDir = path.join(__dirname, '..', 'dist', 'cjs');

if (!fs.existsSync(cjsDir)) {
  console.log('dist/cjs not found, skipping CJS fix');
  process.exit(0);
}

// Write package.json for CJS
const pkg = { type: 'commonjs' };
fs.writeFileSync(
  path.join(cjsDir, 'package.json'),
  JSON.stringify(pkg, null, 2),
  'utf-8'
);

// Also write one for ESM
const esmDir = path.join(__dirname, '..', 'dist', 'esm');
if (fs.existsSync(esmDir)) {
  const esmPkg = { type: 'module' };
  fs.writeFileSync(
    path.join(esmDir, 'package.json'),
    JSON.stringify(esmPkg, null, 2),
    'utf-8'
  );
}

console.log('CJS/ESM package.json files written');
