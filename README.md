# lineclientbot

LINE client library for Node.js & Bun. Modern, fluent, and ergonomic.

## Install

```bash
npm install lineclientbot
```

## Quick Start

```typescript
import { LineClient } from "lineclientbot";

const line = new LineClient();
await line.login("YOUR_AUTH_TOKEN"); // or { authToken: "..." }, { mail, pass }, etc.

// 1. Smart Send (Text, Flex, Media, Sticker in one method)
await line.send("u1234567890abcdef...", "Hello from lineclientbot!");
await line.send("u1234567890abcdef...", {
    flex: myFlexJson,
    altText: "Your receipt"
});

// 2. Listen & Rich Interactive Messages
line.on("message", async (msg) => {
    console.log(`${msg.author.displayName}: ${msg.text}`);
    
    // Reply directly
    await msg.reply("Received your message!");
    await msg.react("LOVE");
    await msg.read();
});

// Start listening (default: talk: true, square: true, mode: 'poll')
line.listen();
```

---

## Modern Ergonomics (Direct Namespaces & Shortcuts)

No more deeply nested `.api.messages.sendText(...)` calls. Everything is accessible directly or via domain managers:

### ⚡ Quick Shortcuts (Most Common Operations)

```typescript
// Login
await line.login("AUTH_TOKEN");

// Send messages (Accepts target MID string, User, ChatChannel, or Contact object)
await line.send(chatId, "Hello!");
await line.send(msg.author, "Direct reply to author!");
await line.send(chatId, { flex: myFlex, altText: "Flex title" });
await line.send(chatId, { image: "./photo.jpg" }); // Local path, Buffer, or Blob
await line.send(chatId, { file: "./document.pdf" }); // Auto-infers filename
await line.send(chatId, { sticker: "12345" });
await line.send(chatId, { location: { title: "Bangkok", latitude: 13.75, longitude: 100.5 } });

// Reply, React, Read, Unsend
await line.reply(msg, "Reply to this message!"); // Accepts Message object or (chatId, messageId, content)
await line.react(msg.id, "LOVE");
await line.read(msg); // Direct Message object or (chatId, messageId)
await line.unsend(msg.id);

// Contacts
await line.addFriend("u123456..."); // Add by MID or User ID

// Graceful Teardown
await line.destroy(); // Closes push/polling streams and disconnects cleanly
```

---

### 📦 Domain Managers

#### Messages (`line.messages`)
```typescript
await line.messages.send(chatId, "Hello");
await line.messages.sendFlex(chatId, "Alt text", flexJson);
await line.messages.sendImage(chatId, buffer);
await line.messages.sendVideo(chatId, buffer);
await line.messages.sendAudio(chatId, buffer);
await line.messages.sendFile(chatId, buffer, "document.pdf");
await line.messages.sendLocation(chatId, { title: "Office", latitude: 13.7, longitude: 100.5 });
await line.messages.sendSticker(chatId, "12345");
await line.messages.react(messageId, "NICE");
await line.messages.read(chatId, messageId);
await line.messages.unsend(messageId);
```

#### Chats & Groups (`line.chats`)
```typescript
// Returns rich ChatChannel instances
const chats = await line.chats.list();
const chat = await line.chats.get(chatMid);

// Interact directly with chat channels
await chat.send("Hello everyone!");
await chat.invite(["u98765..."]);
await chat.leave();
```

#### Contacts & Friends (`line.contacts`)
```typescript
// Returns rich User instances
const contacts = await line.contacts.list();
const user = await line.contacts.get(userMid);

// Interact directly with users
await user.send("Hello friend!");
await user.block();
await user.unblock();

// Add or find friends
await line.contacts.add("u123456...");
await line.contacts.add({ searchId: "john_doe" });
await line.contacts.add({ phone: "+66812345678" });
const found = await line.contacts.find("search_id");
```

#### Direct Sub-Services (`line.talk`, `line.relation`, `line.buddy`, `line.e2ee`, `line.obs`)
Access the underlying Thrift and internal protocol services directly without casting or delving into `.base`:
```typescript
const ids = await line.talk.getAllContactIds();
const promoted = await line.buddy.getPromotedBuddyContacts({ language: "th", country: "TH" });
```

---

## Backward Compatibility

The original `.api.*` facade (`line.api.messages.sendText(...)`, `line.api.chats.list(...)`, `line.api.auth.login(...)`) and legacy top-level methods (`line.sendMessage()`, `line.getMyProfile()`, etc.) are 100% supported and fully backward-compatible.

---

## Constructor & Options

```typescript
new LineClient(options?)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `authToken` | `string` | - | Auth token for direct login |
| `mail` | `string` | - | Email for login |
| `pass` | `string` | - | Password for login |
| `device` | `Device` | `"DESKTOPWIN"` | Device type to emulate |
| `version` | `string` | auto | LINE app version |
| `endpoint` | `string` | `"legy.line-apps.com"` | API endpoint |
| `storage` | `string \| false` | `false` | File path for persistence, or `false` for memory only |
| `rememberMe` | `boolean \| string` | `false` | Remember auth token in a plain text file |

---

## QR Login

```typescript
const client = await LineClient.loginWithQR({
    rememberMe: true,
    onQR: (url) => console.log("Scan:", url),
    onPin: (pin) => console.log("PIN:", pin),
});
```

---

## Events

| Event | Callback | Description |
|-------|----------|-------------|
| `ready` | `(profile: Profile) => void` | Emitted when client is logged in and ready |
| `message` | `(msg: Message) => void` | New message received in 1-on-1 or group chat |
| `event` | `(event: Operation) => void` | Any raw LINE talk operation event |
| `square:message` | `(msg: SquareMessage) => void` | OpenChat / Square message received |
| `square:event` | `(event: SquareEvent) => void` | OpenChat / Square raw event |
| `update:authtoken`| `(token: string) => void` | Emitted when LINE refreshes the auth token |
| `close` | `() => void` | Emitted when client is closed or destroyed |
| `error` | `(err: unknown) => void` | Emitted on connection drops or operational errors |
| `log` | `(data: {type, data}) => void` | Internal diagnostic debug logs |

---

## Standalone Examples

Check the [`examples/`](./examples) directory for complete, ready-to-run recipes:
- [`examples/echo-bot.ts`](./examples/echo-bot.ts) - Complete auto-reply bot with reaction & read receipt
- [`examples/qr-login.ts`](./examples/qr-login.ts) - Terminal QR login with token persistence
- [`examples/send-media.ts`](./examples/send-media.ts) - Sending local photos, documents, stickers & location
- [`examples/flex-card.ts`](./examples/flex-card.ts) - Interactive Flex message receipts

## License

MIT
