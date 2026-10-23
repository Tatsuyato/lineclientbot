#!/usr/bin/env node
/**
 * linejs - Real Usage Test
 * 
 * Usage:
 *   node test/run.js --token YOUR_AUTH_TOKEN
 *   node test/run.js --email your@email.com --password yourpass
 *   node test/run.js --qr
 */

let LineClient;

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
  assert(typeof c1.api === 'object', 'api facade exists');
  assert(typeof c1.api.auth.login === 'function', 'api.auth.login() exists');
  assert(typeof c1.api.profile.get === 'function', 'api.profile.get() exists');
  assert(typeof c1.api.messages.sendText === 'function', 'api.messages.sendText() exists');
  assert(typeof c1.api.chats.list === 'function', 'api.chats.list() exists');
  assert(typeof c1.api.contacts.list === 'function', 'api.contacts.list() exists');
  assert(typeof c1.api.squares.list === 'function', 'api.squares.list() exists');
  assert(typeof c1.api.listen.start === 'function', 'api.listen.start() exists');
  assert(typeof c1.api.system.noop === 'function', 'api.system.noop() exists');
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

  const { MemoryStorage } = await import('../dist/esm/index.js');

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
// Test 4: API Standardization & Compatibility (offline)
// ============================================================
async function testApiStandardization() {
  console.log(`\n${B}━━━ Test 4: API Standardization & Compatibility ━━━${W}`);

  const c = new LineClient();
  const authError = 'Not logged in. Call login() first.';

  // Standardized auth guard message through both access paths
  try {
    await c.getMyProfile();
    assert(false, 'getMyProfile should fail when not logged in');
  } catch (e) {
    assert(e.message === authError, 'getMyProfile uses standardized auth error');
  }

  try {
    await c.api.profile.get();
    assert(false, 'api.profile.get should fail when not logged in');
  } catch (e) {
    assert(e.message === authError, 'api.profile.get uses standardized auth error');
  }

  // Backward compatibility: api facade routes to legacy methods
  c.sendMessage = async (to, text) => ({ to, text });
  const sendResult = await c.api.messages.sendText('u-test', 'hello');
  assert(sendResult.to === 'u-test' && sendResult.text === 'hello', 'api.messages.sendText maps to sendMessage');

  c.getMyProfile = async () => ({ mid: 'u123', displayName: 'Tester' });
  const profile = await c.api.profile.get();
  assert(profile.mid === 'u123', 'api.profile.get maps to getMyProfile');

  c.getChats = async () => ([{ chatMid: 'c123' }]);
  const chats = await c.api.chats.list();
  assert(Array.isArray(chats) && chats.length === 1, 'api.chats.list maps to getChats');

  // Modern managers & convenience methods
  assert(typeof c.send === 'function', 'c.send() exists');
  assert(typeof c.reply === 'function', 'c.reply() exists');
  assert(typeof c.read === 'function', 'c.read() exists');
  assert(typeof c.addFriend === 'function', 'c.addFriend() exists');
  assert(typeof c.findContact === 'function', 'c.findContact() exists');
  assert(c.messages && typeof c.messages.send === 'function', 'c.messages.send() exists');
  assert(c.chats && typeof c.chats.list === 'function', 'c.chats.list() exists');
  assert(c.contacts && typeof c.contacts.list === 'function', 'c.contacts.list() exists');
  assert(c.squares && typeof c.squares.list === 'function', 'c.squares.list() exists');
  assert(c.talk !== undefined, 'c.talk direct access exists');
  assert(c.relation !== undefined, 'c.relation direct access exists');
  assert(c.buddy !== undefined, 'c.buddy direct access exists');
  assert(c.e2ee !== undefined, 'c.e2ee direct access exists');
  assert(c.obs !== undefined, 'c.obs direct access exists');

  // Test c.send polymorphic routing
  c.sendMessage = async (to, text, replyTo) => ({ to, text, replyTo });
  c.sendFlex = async (to, altText, flex, replyTo) => ({ to, altText, flex, replyTo });

  const textRes = await c.send('u123', 'test message');
  assert(textRes.text === 'test message', 'c.send(to, string) routes to sendMessage');

  const flexRes = await c.send('u123', { flex: { type: 'bubble' }, altText: 'Alt' });
  assert(flexRes.altText === 'Alt' && flexRes.flex.type === 'bubble', 'c.send(to, { flex }) routes to sendFlex');

  const replyRes = await c.reply({ channel: { id: 'c123' }, id: 'm456' }, 'hello reply');
  assert(replyRes.to === 'c123' && replyRes.replyTo === 'm456', 'c.reply(msg, text) correctly resolves channel and message ID');

  // Typed EventEmitter test (once, emit, removeAllListeners)
  let onceCount = 0;
  c.once('ready', (prof) => {
    onceCount++;
    assert(prof.displayName === 'ReadyUser', 'Typed once("ready") handler triggered with profile');
  });
  c.emit('ready', { displayName: 'ReadyUser', mid: 'u999' });
  c.emit('ready', { displayName: 'ReadyUser2', mid: 'u999' });
  assert(onceCount === 1, 'Typed once() fires exactly once');

  let qrUrlFired = '';
  c.on('qrcall', (url) => { qrUrlFired = url; });
  c.emit('qrcall', 'https://line.me/R/ti/p/qrcode');
  assert(qrUrlFired === 'https://line.me/R/ti/p/qrcode', 'Typed emit("qrcall") forwards to on("qrcall")');

  assert(typeof c.addListener === 'function', 'c.addListener exists');
  assert(typeof c.removeListener === 'function', 'c.removeListener exists');
  assert(typeof c.removeAllListeners === 'function', 'c.removeAllListeners exists');

  // v1.0 Target Polymorphism
  const targetObjRes = await c.send({ mid: 'uPolymorphic' }, 'hello target');
  assert(targetObjRes.to === 'uPolymorphic', 'c.send({ mid }) resolves destination MID correctly');

  const targetChannelRes = await c.send({ channel: { id: 'cGroup123' } }, 'hello channel');
  assert(targetChannelRes.to === 'cGroup123', 'c.send({ channel: { id } }) resolves destination MID correctly');

  try {
    await c.send('', 'fail');
    assert(false, 'c.send with empty target should throw');
  } catch (e) {
    assert(e.message.includes('Invalid send target'), 'c.send validates invalid or empty target MID');
  }

  // v1.0 Media Path & Input Normalization
  const { resolveMediaBlob } = await import('../dist/esm/index.js');
  const fileBlobRes = await resolveMediaBlob('package.json');
  assert(fileBlobRes.filename === 'package.json' && fileBlobRes.blob.size > 0, 'resolveMediaBlob loads disk file and infers filename');

  const bufBlobRes = await resolveMediaBlob(Buffer.from('hello-world'));
  assert(bufBlobRes.filename === 'file' && bufBlobRes.blob.size === 11, 'resolveMediaBlob accepts Buffer');

  try {
    await resolveMediaBlob('./non-existent-file-xyz.txt');
    assert(false, 'resolveMediaBlob with non-existent path should throw');
  } catch (e) {
    assert(e.message.includes('Media file not found'), 'resolveMediaBlob rejects non-existent file path');
  }

  // v1.0 Lifecycle & Teardown
  assert(c.isDestroyed === false, 'c.isDestroyed is false initially');
  let closeEventFired = false;
  let connClosed = false;
  c.base.push.conns = [{ close: () => { connClosed = true; } }];
  c.on('close', () => { closeEventFired = true; });
  await c.close();
  assert(c.isDestroyed === true, 'c.close() marks client as destroyed');
  assert(closeEventFired === true, 'c.close() emits "close" event');
  assert(connClosed === true, 'c.close() closes active HTTP/2 push connections');
  assert(Array.isArray(c.base.push.conns) && c.base.push.conns.length === 0, 'c.close() empties push connections list');
  assert(typeof c.destroy === 'function', 'c.destroy exists as an alias');
  assert(typeof c.api.system.close === 'function', 'c.api.system.close() exists');
  assert(typeof c.api.system.destroy === 'function', 'c.api.system.destroy() exists');

  // Verify reply preserves replyTo for media
  const c2 = new LineClient();
  let mediaReplyOptions = null;
  c2.sendImage = async (to, data, replyTo) => {
    mediaReplyOptions = { to, data, replyTo };
    return { to, replyTo };
  };
  await c2.reply({ channel: { id: 'c999' }, id: 'm123' }, { image: Buffer.from('img') });
  assert(mediaReplyOptions !== null && mediaReplyOptions.replyTo === 'm123', 'reply({ image }) preserves replyTo for media messages');
}

// ============================================================
// Test 5: E2EE Letter Sealing & Encryption / Decryption
// ============================================================
async function testE2EELetterSealing() {
  console.log(`\n${B}━━━ Test 5: E2EE Letter Sealing (Encryption & Decryption) ━━━${W}`);

  const nacl = require('tweetnacl');
  const { byte2int } = require('../dist/cjs/base/e2ee/mod.js');
  const c = new LineClient();
  const e2ee = c.base.e2ee;

  // 1. byte2int test
  const testNum = 6078902;
  const numBytes = Buffer.from(e2ee.getIntBytes(testNum));
  const decodedNum = byte2int(numBytes);
  assert(decodedNum === testNum, 'byte2int correctly decodes 32-bit big-endian integer');

  // 2. Storage fallback for e2eeKeys:latest
  const fakeKey = {
    keyId: 1001,
    privKey: Buffer.from(nacl.box.keyPair().secretKey).toString('base64'),
    pubKey: Buffer.from(nacl.box.keyPair().publicKey).toString('base64'),
    e2eeVersion: 1
  };
  await c.base.storage.set('e2eeKeys:latest', JSON.stringify(fakeKey));
  const retrievedSelfKey = await e2ee.getE2EESelfKeyData('u_nonexistent_mid');
  assert(retrievedSelfKey && retrievedSelfKey.keyId === 1001, 'getE2EESelfKeyData falls back to e2eeKeys:latest');

  // Test mid-scoping: if latestKey has mid: 'u_alice', bob should not adopt it
  const scopedAliceKey = { ...fakeKey, mid: 'u_alice' };
  await c.base.storage.set('e2eeKeys:latest', JSON.stringify(scopedAliceKey));
  try {
    await e2ee.getE2EESelfKeyData('u_bob');
    assert(false, 'getE2EESelfKeyData should reject e2eeKeys:latest belonging to another mid');
  } catch (e) {
    assert(e.name === 'NoE2EEKey', 'getE2EESelfKeyData rejects latest key belonging to another mid');
  }

  // 3. Round-trip E2EE V2 encryption and decryption between two parties
  const aliceMID = 'u_alice_test_mid_1234567890123456';
  const bobMID = 'u_bob_test_mid_123456789012345678';
  const alicePair = nacl.box.keyPair();
  const bobPair = nacl.box.keyPair();
  const aliceKeyId = 1111;
  const bobKeyId = 2222;

  // Alice computes shared secret and encrypts
  const alicePriv = Buffer.from(alicePair.secretKey);
  const bobPub = Buffer.from(bobPair.publicKey);
  const aliceShared = Buffer.from(e2ee.generateSharedSecret(alicePriv, bobPub));

  const secretMessage = 'Hello, this is a secure LINE Letter Sealing message!';
  const chunks = e2ee.encryptE2EETextMessage(
    aliceKeyId,
    bobKeyId,
    aliceShared,
    2, // specVersion
    secretMessage,
    bobMID,
    aliceMID
  );

  assert(Array.isArray(chunks) && chunks.length === 5, 'encryptE2EETextMessage produces 5 chunks');
  assert(byte2int(chunks[3]) === aliceKeyId, 'Chunk[3] contains aliceKeyId');
  assert(byte2int(chunks[4]) === bobKeyId, 'Chunk[4] contains bobKeyId');

  // Bob decrypts using Bob's private key and Alice's public key
  const bobPriv = Buffer.from(bobPair.secretKey);
  const alicePub = Buffer.from(alicePair.publicKey);
  const decryptedObj = e2ee.decryptE2EEMessageV2(
    bobMID,
    aliceMID,
    chunks,
    bobPriv,
    alicePub,
    2,
    0
  );

  assert(decryptedObj && decryptedObj.text === secretMessage, 'decryptE2EEMessageV2 decrypts message perfectly');

  // 4. getE2EELocalPublicKey cached lookup
  await c.base.storage.set(`e2eePublicKeys:${bobKeyId}`, bobPub.toString('base64'));
  const cachedPub = await e2ee.getE2EELocalPublicKey(bobMID, bobKeyId);
  assert(Buffer.isBuffer(cachedPub) && cachedPub.equals(bobPub), 'getE2EELocalPublicKey retrieves cached public key');
}

// ============================================================
// Test 5: Login (requires credentials)
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
// Test 6: Profile (requires login)
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
// Test 7: Messages (requires login + target)
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
// Test 8: Listen (requires login, runs for 10 seconds)
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
// Test 9: Chat Operations (requires login)
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
  const lib = await import('../dist/esm/index.js');
  LineClient = lib.LineClient;
  console.log(`${B}╔════════════════════════════════════════════╗${W}`);
  console.log(`${B}║   linejs - Real Usage Test                 ║${W}`);
  console.log(`${B}╚════════════════════════════════════════════╝${W}`);

  // Run offline tests
  await testConstructor();
  await testEvents();
  await testStorage();
  await testApiStandardization();
  await testE2EELetterSealing();

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
