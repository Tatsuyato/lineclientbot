# lineclientbot

LINE client library for Node.js.

## Install

```bash
npm install lineclientbot
```

## Quick Start

```typescript
import { LineClient } from "lineclientbot";

// Login with auth token
const line = new LineClient();
await line.login({ authToken: "YOUR_AUTH_TOKEN" });

// Send a message
await line.sendMessage("u1234567890abcdef1234567890abcdef", "Hello!");

// Listen for messages
line.on("message", async (msg) => {
    console.log(`${msg.from}: ${msg.text}`);
    await msg.reply(`Echo: ${msg.text}`);
});

line.listen();
```

If you want the library to remember the login automatically, pass `rememberMe: true` or `rememberMe: "./my-token.txt"`.

## API

### Constructor

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

### Login

```typescript
// With auth token
const line = new LineClient();
await line.login({ authToken: "xxx" });

// With email/password
const line2 = new LineClient();
await line2.login({ mail: "email@example.com", pass: "password" });

// QR Login with event callbacks
const qrClient = await LineClient.loginWithQR({
    rememberMe: true,
    onQR: (url) => console.log("Scan:", url),
    onPin: (pin) => console.log("PIN:", pin),
});

// QR Login from an instance
const client = new LineClient();
await client.login({ rememberMe: true });
```

QR login is the easiest way to get a fresh `authToken`. When `rememberMe` is enabled, the library stores the token in a text file and reuses it on later runs.

### Profile

```typescript
const profile = await line.getMyProfile();
await line.updateMyProfile({ displayName: "New Name" });
```

### Messages

```typescript
// Send text
await line.sendMessage(chatId, "Hello!");

// Other message types (require full integration)
await line.sendImage(chatId, imageBuffer);
await line.sendVideo(chatId, videoBuffer);
await line.sendAudio(chatId, audioBuffer);
await line.sendFile(chatId, fileBuffer, "file.txt");
await line.sendSticker(chatId, "stickerId");
await line.sendFlex(chatId, "Alt text", flexJson);
await line.sendLocation(chatId, {
    title: "Location",
    address: "123 Street",
    latitude: 13.7563,
    longitude: 100.5018,
});
```

### Chat Management

```typescript
const chats = await line.getChats();
const chat = await line.getChat(chatMid);
const newChat = await line.createChat({ name: "My Group", memberMids: ["mid1", "mid2"] });
await line.inviteToChat(chatMid, ["mid1"]);
await line.leaveChat(chatMid);
```

### Friends

```typescript
const contacts = await line.getContacts();
const user = await line.getContact(userMid);
await line.blockContact(userMid);
await line.unblockContact(userMid);
```

### OpenChat (Square)

```typescript
const squares = await line.getSquares();
await line.joinSquare(invitationUrl);
await line.leaveSquare(squareMid);
```

### Events

```typescript
line.on("message", async (msg) => {
    console.log(msg.text);
    await msg.reply("Got it!");
    await msg.react("👍");
    await msg.read();
});

line.on("event", (event) => {
    console.log("Event:", event.type);
});

line.listen();
```

### Storage

```typescript
import { LineClient, FileStorage, MemoryStorage } from "lineclientbot";

// File-based storage (persists across restarts)
const lineWithFileStorage = new LineClient({
    authToken: "xxx",
    storage: "./line-data.json",
});

// Memory storage (default, no persistence)
const lineInMemory = new LineClient({
    authToken: "xxx",
    storage: false,
});
```

## Device Types

| Device | Description |
|--------|-------------|
| `"DESKTOPWIN"` | Windows desktop (default) |
| `"DESKTOPMAC"` | Mac desktop |
| `"ANDROID"` | Android phone |
| `"ANDROIDSECONDARY"` | Android secondary device |
| `"IOS"` | iPhone |
| `"IOSIPAD"` | iPad |
| `"WATCHOS"` | Apple Watch |
| `"WEAROS"` | Wear OS |

## Events

| Event | Callback | Description |
|-------|----------|-------------|
| `message` | `(msg: MessageEvent) => void` | New message received |
| `event` | `(event: any) => void` | Any LINE event |
| `square:message` | `(msg: MessageEvent) => void` | OpenChat message |
| `square:event` | `(event: any) => void` | OpenChat event |
| `log` | `(data: {type, data}) => void` | Debug logs |

## License

MIT
