#!/usr/bin/env node
/**
 * linejs - File Upload Example
 * 
 * Usage:
 *   node test/upload.js --token YOUR_AUTH_TOKEN --file path/to/file.jpg --to CHAT_MID
 * 
 * This example demonstrates how to send images, videos, audio, and files.
 */

const { LineClient } = require('../dist/cjs/index.js');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf('--' + name);
  return i !== -1 ? args[i + 1] : undefined;
}

const TOKEN = getArg('token');
const FILE_PATH = getArg('file');
const TO = getArg('to');

async function main() {
  if (!TOKEN || !FILE_PATH || !TO) {
    console.log('Usage:');
    console.log('  node test/upload.js --token YOUR_TOKEN --file path/to/file --to CHAT_MID');
    console.log('');
    console.log('Supported file types:');
    console.log('  .jpg/.png/.gif  → sendImage()');
    console.log('  .mp4/.mov       → sendVideo()');
    console.log('  .mp3/.m4a       → sendAudio()');
    console.log('  Other           → sendFile()');
    process.exit(1);
  }

  if (!fs.existsSync(FILE_PATH)) {
    console.error(`File not found: ${FILE_PATH}`);
    process.exit(1);
  }

  const line = new LineClient();
  await line.login({ authToken: TOKEN });
  console.log(`Logged in as: ${line.profile?.displayName}`);

  const ext = path.extname(FILE_PATH).toLowerCase();
  const data = fs.readFileSync(FILE_PATH);
  const filename = path.basename(FILE_PATH);

  console.log(`\nUploading: ${filename} (${data.length} bytes)`);
  console.log(`To: ${TO}`);

  try {
    let result;

    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      console.log('Type: Image');
      result = await line.sendImage(TO, data);
    } else if (['.mp4', '.mov', '.avi'].includes(ext)) {
      console.log('Type: Video');
      result = await line.sendVideo(TO, data);
    } else if (['.mp3', '.m4a', '.wav', '.ogg'].includes(ext)) {
      console.log('Type: Audio');
      result = await line.sendAudio(TO, data);
    } else {
      console.log('Type: File');
      result = await line.sendFile(TO, data, filename);
    }

    console.log('\n✓ Upload successful!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(`\n✗ Upload failed: ${e.message}`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
