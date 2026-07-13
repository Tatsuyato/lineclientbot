#!/usr/bin/env node
/**
 * linejs - Real Usage Test
 * 
 * Usage:
 *   node test/run.js --token YOUR_AUTH_TOKEN
 *   node test/run.js --email your@email.com --password yourpass
 *   node test/run.js --qr
 */

const { LineClient } = require('../dist/cjs/index.js');

// Parse args
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf('--' + name);
  return i !== -1 ? args[i + 1] : undefined;
}

const TOKEN = getArg('token');
const EMAIL = getArg('email');
const PASSWORD = getArg('password');
const QR = args.includes('--qr');

// Colors
const R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', B = '\x1b[34m', W = '\x1b[0m';
const ok = (msg) => console.log(`${G}✓${W} ${msg}`);
const fail = (msg) => console.log(`${R}✗${W} ${msg}`);
const info = (msg) => console.log(`${B}ℹ${W} ${msg}`);
const warn = (msg) => console.log(`${Y}⚠${W} ${msg}`);

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition, msg) {
  if (condition) { passed++; ok(msg); }
  else { failed++; fail(msg); }
}

function skip(msg) { skipped++; warn(`SKIP: ${msg}`); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// Test 1: Constructor & Basic Properties
// ============================================================
async function testConstructor() {
  console.log(`\n${B}━━━ Test 1: Constructor & Basic Properties ━━━${W}`);

  const c1 = new LineClient();
  assert(c1.device === 'DESKTOPWIN', 'Default device is DESKTOPWIN');
  assert(c1.isLoggedIn === false, 'isLoggedIn is false');
  assert(c1.authToken === undefined, 'authToken is undefined');
  assert(c1.profile === undefined, 'profile is undefined');

  const c2 = new LineClient({ device: 'ANDROID' });
  assert(c2.device === 'ANDROID', 'Custom device: ANDROID');

  const c3 = new LineClient({ storage: false });
  assert(c3.storage.constructor.name === 'MemoryStorage', 'MemoryStorage by default');

  assert(typeof c1.login === 'function', 'login() exists');
  assert(typeof c1.sendMessage === 'function', 'sendMessage() exists');
  assert(typeof c1.listen === 'function', 'listen() exists');
  assert(typeof c1.getChats === 'function', 'getChats() exists');
  assert(typeof c1.on === 'function', 'on() exists');
}

// ============================================================
// Test 2: Events
// ============================================================
async function testEvents() {
  console.log(`\n${B}━━━ Test 2: Event System ━━━${W}`);

  const c = new LineClient();
  let logReceived = false;
  let messageReceived = false;

  c.on('log', (data) => {
    logReceived = true;
    assert(data.type === 'test', 'Log event type matches');
    assert(data.data.value === 42, 'Log event data matches');
  });

  c.on('message', (msg) => { messageReceived = true; });

  // Trigger via base
  c.base.emit('log', { type: 'test', data: { value: 42 } });

  await sleep(50);
  assert(logReceived, 'Log event listener triggered');

  // Test off
  c.off('log', () => {});
  assert(typeof c.off === 'function', 'off() exists');
}

// ============================================================
// Test 3: Storage
// ============================================================
async function testStorage() {
  console.log(`\n${B}━━━ Test 3: Storage ━━━${W}`);

  const { MemoryStorage } = require('../dist/cjs/index.js');

  const mem = new MemoryStorage();
  await mem.set('key1', 'value1');
  const v1 = await mem.get('key1');
  assert(v1 === 'value1', 'MemoryStorage set/get works');

  await mem.delete('key1');
  const v2 = await mem.get('key1');
  assert(v2 === undefined, 'MemoryStorage delete works');

  const all = mem.getAll();
  assert(typeof all === 'object', 'MemoryStorage getAll() returns object');

  await mem.clear();
  const all2 = mem.getAll();
  assert(Object.keys(all2).length === 0, 'MemoryStorage clear() works');
}

// ============================================================
// Test 4: Login (requires credentials)
// ============================================================
async function testLogin() {
  console.log(`\n${B}━━━ Test 4: Login ━━━${W}`);

  if (!TOKEN && !EMAIL && !QR) {
    skip('No credentials provided. Use --token, --email/--password, or --qr');
    return;
  }

  const c = new LineClient();

  try {
    if (TOKEN) {
      info(`Logging in with auth token...`);
      const profile = await c.login({ authToken: TOKEN });
      assert(c.isLoggedIn === true, 'isLoggedIn is true after login');
      assert(profile !== undefined, 'Profile returned');
      assert(typeof profile.mid === 'string', 'Profile has mid');
      assert(typeof profile.displayName === 'string', 'Profile has displayName');
      info(`Logged in as: ${profile.displayName} (${profile.mid})`);
    } else if (EMAIL && PASSWORD) {
      info(`Logging in with email: ${EMAIL}...`);
      const profile = await c.login({ mail: EMAIL, pass: PASSWORD });
      assert(c.isLoggedIn === true, 'isLoggedIn is true after login');
      assert(profile !== undefined, 'Profile returned');
      info(`Logged in as: ${profile.displayName} (${profile.mid})`);
    } else if (QR) {
      info('Starting QR login...');
      const client = await LineClient.loginWithQR({
        onQR: (url) => {
          console.log(`\n${Y}Scan this QR URL:${W}`);
          console.log(url);
          console.log();
        },
        onPin: (pin) => {
          console.log(`${Y}PIN: ${pin}${W}`);
        },
      });
      assert(client.isLoggedIn === true, 'isLoggedIn is true after QR login');
      info(`Logged in as: ${client.profile?.displayName}`);
    }
  } catch (e) {
    fail(`Login failed: ${e.message}`);
  }
}

// ============================================================
// Test 5: Profile (requires login)
// ============================================================
async function testProfile(c) {
  console.log(`\n${B}━━━ Test 5: Profile ━━━${W}`);

  if (!c) { skip('Not logged in'); return; }

  try {
    const profile = await c.getMyProfile();
    assert(typeof profile === 'object', 'getMyProfile() returns object');
    assert(typeof profile.mid === 'string', 'Profile has mid');
    info(`Profile: ${profile.displayName}`);
  } catch (e) {
    fail(`getMyProfile failed: ${e.message}`);
  }
}

// ============================================================
// Test 6: Messages (requires login + target)
// ============================================================
async function testMessages(c) {
  console.log(`\n${B}━━━ Test 6: Messages ━━━${W}`);

  if (!c) { skip('Not logged in'); return; }

  // List chats to find a target
  try {
    const chats = await c.getChats();
    assert(Array.isArray(chats), 'getChats() returns array');
    info(`Found ${chats.length} chats`);

    if (chats.length > 0) {
      const target = chats[0];
      const chatMid = target.chatMid || target.chat_mid || target.mid;
      info(`Sending test message to: ${chatMid}`);

      try {
        const msg = await c.sendMessage(chatMid, `[linejs] Test message at ${new Date().toISOString()}`);
        assert(msg !== undefined, 'sendMessage() returns result');
        info(`Message sent: ${msg.id || 'OK'}`);
      } catch (e) {
        fail(`sendMessage failed: ${e.message}`);
      }
    } else {
      skip('No chats available for message test');
    }
  } catch (e) {
    fail(`getChats failed: ${e.message}`);
  }
}

// ============================================================
// Test 7: Listen (requires login, runs for 10 seconds)
// ============================================================
async function testListen(c) {
  console.log(`\n${B}━━━ Test 7: Listen (10 seconds) ━━━${W}`);

  if (!c) { skip('Not logged in'); return; }

  let messageCount = 0;
  let eventCount = 0;

  c.on('message', (msg) => {
    messageCount++;
    info(`Message received: ${msg.text || '(no text)'}`);
  });

  c.on('event', (event) => {
    eventCount++;
  });

  c.on('log', (data) => {
    if (data.type.includes('poll') || data.type.includes('sync')) {
      info(`Log: ${data.type}`);
    }
  });

  try {
    c.listen({ talk: true, square: false });
    info('Listening for events... (10 seconds)');

    await sleep(10000);

    c.base.push.opStream.close();
    info(`Listen stopped. Messages: ${messageCount}, Events: ${eventCount}`);
    assert(true, 'Listen completed without crash');
  } catch (e) {
    fail(`Listen failed: ${e.message}`);
  }
}

// ============================================================
// Test 8: Chat Operations (requires login)
// ============================================================
async function testChatOps(c) {
  console.log(`\n${B}━━━ Test 8: Chat Operations ━━━${W}`);

  if (!c) { skip('Not logged in'); return; }

  try {
    const mids = await c.getAllChatMids();
    assert(mids !== undefined, 'getAllChatMids() returns result');
    info(`Chat mids: member=${mids.memberChatMids?.length || 0}`);
  } catch (e) {
    fail(`getAllChatMids failed: ${e.message}`);
  }
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log(`${B}╔════════════════════════════════════════════╗${W}`);
  console.log(`${B}║   linejs - Real Usage Test                 ║${W}`);
  console.log(`${B}╚════════════════════════════════════════════╝${W}`);

  // Run offline tests
  await testConstructor();
  await testEvents();
  await testStorage();

  // Login
  let client = null;
  if (TOKEN || EMAIL || QR) {
    try {
      const c = new LineClient();
      if (TOKEN) {
        await c.login({ authToken: TOKEN });
      } else if (EMAIL && PASSWORD) {
        await c.login({ mail: EMAIL, pass: PASSWORD });
      } else if (QR) {
        // Handled in testLogin
      }
      if (c.isLoggedIn) client = c;
    } catch (e) {
      // Already reported in testLogin
    }
  }

  await testLogin();
  await testProfile(client);
  await testMessages(client);
  await testChatOps(client);
  await testListen(client);

  // Summary
  console.log(`\n${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${W}`);
  console.log(`${G}Passed: ${passed}${W}  ${R}Failed: ${failed}${W}  ${Y}Skipped: ${skipped}${W}`);
  console.log(`${B}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${W}`);

  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
