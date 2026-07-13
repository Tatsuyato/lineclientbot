#!/usr/bin/env node
/**
 * linejs - Simple Echo Bot Example
 * 
 * Usage:
 *   node test/bot.js --token YOUR_AUTH_TOKEN
 *   node test/bot.js --email your@email.com --password yourpass
 *   node test/bot.js --qr
 * 
 * The bot will:
 *   - Reply "Echo: <message>" to every text message
 *   - Log all events
 *   - Run until you press Ctrl+C
 */

const { LineClient } = require('../dist/cjs/index.js');

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf('--' + name);
  return i !== -1 ? args[i + 1] : undefined;
}

const TOKEN = getArg('token');
const EMAIL = getArg('email');
const PASSWORD = getArg('password');
const QR = args.includes('--qr');

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  linejs - Echo Bot');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!TOKEN && !EMAIL && !QR) {
    console.log('Usage:');
    console.log('  node test/bot.js --token YOUR_AUTH_TOKEN');
    console.log('  node test/bot.js --email your@email.com --password yourpass');
    console.log('  node test/bot.js --qr');
    process.exit(1);
  }

  // Create client
  const line = new LineClient({
    storage: './test/bot-data.json',  // Persist session
  });

  // Login
  try {
    if (TOKEN) {
      console.log('Logging in with auth token...');
      await line.login({ authToken: TOKEN });
    } else if (EMAIL && PASSWORD) {
      console.log(`Logging in with email: ${EMAIL}...`);
      await line.login({ mail: EMAIL, pass: PASSWORD });
    } else if (QR) {
      console.log('Starting QR login...');
      const qrClient = await LineClient.loginWithQR({
        onQR: (url) => {
          console.log(`\nScan this URL:\n${url}\n`);
        },
        onPin: (pin) => {
          console.log(`PIN: ${pin}`);
        },
      });
      // Replace with QR client
      Object.assign(line, qrClient);
    }

    console.log(`\n✓ Logged in as: ${line.profile?.displayName}`);
    console.log(`  MID: ${line.profile?.mid}`);
  } catch (e) {
    console.error(`\n✗ Login failed: ${e.message}`);
    process.exit(1);
  }

  // Message handler
  line.on('message', async (msg) => {
    console.log(`\n[${new Date().toISOString()}] Message from ${msg.from}`);
    console.log(`  Text: ${msg.text}`);

    // Echo back
    if (msg.text) {
      try {
        await msg.reply(`Echo: ${msg.text}`);
        console.log('  ✓ Replied');
      } catch (e) {
        console.error(`  ✗ Reply failed: ${e.message}`);
      }
    }
  });

  // Event handler
  line.on('event', (event) => {
    console.log(`\n[Event] ${event.type}`);
  });

  // Square message handler
  line.on('square:message', async (msg) => {
    console.log(`\n[Square] ${msg.squareChatMid}: ${msg.text}`);
  });

  // Log handler (debug)
  line.on('log', (data) => {
    if (data.type.includes('error') || data.type.includes('fail')) {
      console.log(`[Log] ${data.type}: ${JSON.stringify(data.data)}`);
    }
  });

  // Start listening
  console.log('\nListening for messages... (Ctrl+C to stop)\n');
  line.listen({ talk: true, square: true });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down...');
    line.base.push.opStream.close();
    line.base.push.sqStream.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    line.base.push.opStream.close();
    line.base.push.sqStream.close();
    process.exit(0);
  });
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
