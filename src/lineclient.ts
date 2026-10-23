import { BaseClient, type ClientInit, type LoginOption } from "./base/core/mod.js";
import { byte2int } from "./base/e2ee/mod.js";
import type { Device } from "./types/devices.js";
import { getDeviceDetails } from "./types/devices.js";
import { BaseStorage, MemoryStorage, FileStorage } from "./base/storage/mod.js";
import type { Polling } from "./base/polling/mod.js";
import { continueRequest } from "./base/core/mod.js";
import type * as LINETypes from "./types/line/line_types.js";
import type { CompactMessageResponse } from "./base/service/talk/mod.js";
import type { TalkService } from "./base/service/talk/mod.js";
import type { RelationService } from "./base/service/relation/mod.js";
import { BuddyService } from "./base/service/buddy/mod.js";
import type { E2EE } from "./base/e2ee/mod.js";
import type { LineObs } from "./base/obs/mod.js";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const DEFAULT_REMEMBER_PATH = "./remember-me.txt";
const DEFAULT_REMEMBER_STORAGE_PATH = "./remember-me.storage.json";

function resolveRememberPath(rememberMe?: boolean | string): string | undefined {
	if (!rememberMe) return undefined;
	return typeof rememberMe === "string" ? rememberMe : DEFAULT_REMEMBER_PATH;
}

function resolveRememberStoragePath(rememberMe?: boolean | string): string | undefined {
	if (!rememberMe) return undefined;
	return typeof rememberMe === "string"
		? `${rememberMe}.storage.json`
		: DEFAULT_REMEMBER_STORAGE_PATH;
}

function encryptToken(token: string, secret: string): string {
	const iv = randomBytes(16);
	const key = scryptSync(secret, "salt-lineclientbot", 32);
	const cipher = createCipheriv("aes-256-cbc", key, iv);
	let encrypted = cipher.update(token, "utf8", "hex");
	encrypted += cipher.final("hex");
	return iv.toString("hex") + ":" + encrypted;
}

function decryptToken(encryptedText: string, secret: string): string {
	const parts = encryptedText.split(":");
	const iv = Buffer.from(parts.shift()!, "hex");
	const encrypted = parts.join(":");
	const key = scryptSync(secret, "salt-lineclientbot", 32);
	const decipher = createDecipheriv("aes-256-cbc", key, iv);
	let decrypted = decipher.update(encrypted, "hex", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
}

async function readRememberedToken(path: string, secret?: string): Promise<string | undefined> {
	try {
		if (!existsSync(path)) return undefined;
		let token = (await readFile(path, "utf8")).trim();
		if (secret && token) {
			token = decryptToken(token, secret);
		}
		return token || undefined;
	} catch {
		return undefined;
	}
}

async function writeRememberedToken(path: string, token: string, secret?: string): Promise<void> {
	const directory = dirname(path);
	if (directory !== ".") {
		await mkdir(directory, { recursive: true });
	}
	let dataToSave = token.trim();
	if (secret) {
		dataToSave = encryptToken(dataToSave, secret);
	}
	await writeFile(path, dataToSave, "utf8");
}

// ====== Public Types ======

export type ReactionType =
	| "ALL"
	| "UNDO"
	| "NICE"
	| "LOVE"
	| "FUN"
	| "AMAZING"
	| "SAD"
	| "OMG"
	| 0
	| 1
	| 2
	| 3
	| 4
	| 5
	| 6
	| 7;

export type MediaInput = Buffer | Blob | Uint8Array | string;

export type SendTarget =
	| string
	| {
			mid?: string;
			id?: string;
			to?: string;
			from?: string;
			squareChatMid?: string;
			channel?: { mid?: string; id?: string };
	  };

export function resolveSendTarget(target: SendTarget): string {
	if (typeof target === "string") {
		const trimmed = target.trim();
		if (!trimmed) {
			throw new Error("Invalid send target: target MID cannot be empty");
		}
		return trimmed;
	}
	if (target && typeof target === "object") {
		const mid =
			target.mid ||
			target.id ||
			(target as any).squareChatMid ||
			(target as any).channel?.mid ||
			(target as any).channel?.id ||
			target.to ||
			target.from;
		if (typeof mid === "string" && mid.trim()) {
			return mid.trim();
		}
	}
	throw new Error(`Invalid send target: unable to resolve MID from ${JSON.stringify(target)}`);
}

export async function resolveMediaBlob(
	data: MediaInput,
	defaultFilename?: string,
): Promise<{ blob: Blob; filename: string }> {
	if (typeof data === "string") {
		if (existsSync(data)) {
			const buf = await readFile(data);
			const filename = defaultFilename || basename(data) || "file";
			return { blob: new Blob([buf]), filename };
		}
		if (data.startsWith("data:") && data.includes(";base64,")) {
			const base64Data = data.split(";base64,")[1];
			const buf = Buffer.from(base64Data, "base64");
			return { blob: new Blob([buf]), filename: defaultFilename || "file" };
		}
		throw new Error(`Media file not found or invalid input path: ${data}`);
	}
	if (data instanceof Blob) {
		return { blob: data, filename: defaultFilename || (data as any).name || "file" };
	}
	return { blob: new Blob([data as any]), filename: defaultFilename || "file" };
}

export interface SendTextOptions {
	text: string;
	replyTo?: string;
}

export interface SendFlexOptions {
	altText: string;
	flex: any;
	replyTo?: string;
}

export interface SendImageOptions {
	image: MediaInput;
	replyTo?: string;
}

export interface SendVideoOptions {
	video: MediaInput;
	replyTo?: string;
}

export interface SendAudioOptions {
	audio: MediaInput;
	replyTo?: string;
}

export interface SendFileOptions {
	file: MediaInput;
	filename?: string;
	replyTo?: string;
}

export interface SendStickerOptions {
	sticker: string | { stickerId: string; packageId?: string; version?: string };
	replyTo?: string;
}

export interface SendLocationOptions {
	location: { title: string; address?: string; latitude: number; longitude: number };
	replyTo?: string;
}

export interface TextPayload {
	text: string;
	replyTo?: string;
}

export interface FlexPayload {
	altText?: string;
	flex: any;
	replyTo?: string;
}

export interface ImagePayload {
	image: MediaInput;
	replyTo?: string;
}

export interface VideoPayload {
	video: MediaInput;
	replyTo?: string;
}

export interface AudioPayload {
	audio: MediaInput;
	replyTo?: string;
}

export interface FilePayload {
	file: MediaInput;
	filename?: string;
	replyTo?: string;
}

export interface StickerPayload {
	sticker: string | { stickerId: string; packageId?: string; version?: string };
	replyTo?: string;
}

export interface LocationPayload {
	location: { title: string; address?: string; latitude: number; longitude: number };
	replyTo?: string;
}

export type MessagePayload =
	| string
	| TextPayload
	| FlexPayload
	| ImagePayload
	| VideoPayload
	| AudioPayload
	| FilePayload
	| StickerPayload
	| LocationPayload
	| {
			text?: string;
			altText?: string;
			flex?: any;
			image?: MediaInput;
			video?: MediaInput;
			audio?: MediaInput;
			file?: MediaInput;
			filename?: string;
			sticker?: string | { stickerId: string; packageId?: string; version?: string };
			location?: { title: string; address?: string; latitude: number; longitude: number };
			replyTo?: string;
	  };

export interface AddFriendOptions {
	mid?: string;
	userId?: string;
	searchId?: string;
	phone?: string;
	reference?: string;
}

export interface FindContactOptions {
	searchId?: string;
	userId?: string;
	phone?: string;
	mid?: string;
}

export interface LineClientOptions {
	mail?: string;
	pass?: string;
	authToken?: string;
	device?: Device;
	version?: string;
	endpoint?: string;
	storage?: string | false;
	pincode?: string;
	e2ee?: boolean;
	rememberMe?: boolean | string;
	rememberMeSecret?: string;
}

export type ClientEvents = {
	/** Emitted when a new message is received in 1-on-1 or group chat */
	message: (message: Message) => void;
	/** Emitted for all raw Talk operations */
	event: (event: LINETypes.Operation) => void;
	/** Emitted when an OpenChat / Square message is received */
	"square:message": (message: SquareMessage) => void;
	/** Emitted for all raw Square events */
	"square:event": (event: LINETypes.SquareEvent) => void;
	/** Emitted when a QR login URL is generated */
	qrcall: (url: string) => void;
	/** Emitted when a PIN is required during QR login */
	pincall: (pin: string) => void;
	/** Emitted when the auth token is updated */
	"update:authtoken": (token: string) => void;
	/** Emitted when client is ready after login */
	ready: (profile: LINETypes.Profile) => void;
	/** Emitted when client is gracefully stopped or destroyed */
	close: () => void;
	/** Emitted on errors */
	error: (error: Error | unknown) => void;
	/** Emitted for internal debug logs */
	log: (data: { type: string; data: any }) => void;
};

export interface ListenOptions {
	talk?: boolean;
	square?: boolean;
	signal?: AbortSignal;
	mode?: "push" | "poll" | "polling";
	pollingInterval?: number;
}

export interface LineClientApi {
	auth: {
		login: (options?: string | LineClientOptions) => Promise<LINETypes.Profile>;
	};
	profile: {
		get: () => Promise<LINETypes.Profile>;
		update: (update: { displayName?: string; statusMessage?: string }) => Promise<void>;
	};
	messages: MessageManager;
	chats: {
		list: () => Promise<LINETypes.Chat[]>;
		get: (chatMid: string) => Promise<LINETypes.Chat>;
		create: (options: { name?: string; memberMids?: string[] }) => Promise<LINETypes.CreateChatResponse>;
		invite: (chatMid: string, memberMids: string[]) => Promise<void>;
		leave: (chatMid: string) => Promise<void>;
		listIds: () => Promise<LINETypes.GetAllChatMidsResponse>;
	};
	contacts: {
		list: () => Promise<LINETypes.ContactEntry[]>;
		get: (userMid: string) => Promise<LINETypes.Contact>;
		add: (options: string | AddFriendOptions) => Promise<any>;
		find: (options: string | FindContactOptions) => Promise<LINETypes.Contact>;
		block: (userMid: string) => Promise<void>;
		unblock: (userMid: string) => Promise<void>;
	};
	squares: SquareManager;
	listen: {
		start: (options?: ListenOptions) => void;
	};
	system: {
		getServerTime: () => Promise<number>;
		noop: () => Promise<void>;
		close: () => Promise<void>;
		destroy: () => Promise<void>;
	};
}

// ====== Modern Domain Managers ======

export class MessageManager {
	constructor(private readonly client: LineClient) {}

	async send(to: SendTarget, content: MessagePayload): Promise<LINETypes.Message> {
		return this.client.send(to, content);
	}

	async sendText(to: SendTarget, text: string, replyTo?: string): Promise<LINETypes.Message> {
		return this.client.sendMessage(to, text, replyTo);
	}

	async sendFlex(to: SendTarget, altText: string, flexJson: any, replyTo?: string): Promise<LINETypes.Message> {
		return this.client.sendFlex(to, altText, flexJson, replyTo);
	}

	async sendImage(to: SendTarget, data: MediaInput): Promise<LINETypes.Message> {
		return this.client.sendImage(to, data);
	}

	async sendVideo(to: SendTarget, data: MediaInput): Promise<LINETypes.Message> {
		return this.client.sendVideo(to, data);
	}

	async sendAudio(to: SendTarget, data: MediaInput): Promise<LINETypes.Message> {
		return this.client.sendAudio(to, data);
	}

	async sendFile(to: SendTarget, data: MediaInput, filename?: string): Promise<LINETypes.Message> {
		return this.client.sendFile(to, data, filename);
	}

	async sendLocation(
		to: SendTarget,
		location: { title: string; address?: string; latitude: number; longitude: number },
		replyTo?: string,
	): Promise<LINETypes.Message> {
		return this.client.sendLocation(to, location, replyTo);
	}

	async sendSticker(
		to: SendTarget,
		stickerId: string,
		packageId?: string,
		version?: string,
		replyTo?: string,
	): Promise<LINETypes.Message> {
		return this.client.sendSticker(to, stickerId, packageId, version, replyTo);
	}

	async sendCompact(to: SendTarget, text: string): Promise<CompactMessageResponse> {
		return this.client.sendCompactMessage(to, text);
	}

	async reply(
		toOrMessage: SendTarget | Message | { channel?: { id?: string; mid?: string }; to?: string; id: string },
		messageIdOrContent: string | MessagePayload,
		maybeContent?: MessagePayload,
	): Promise<LINETypes.Message> {
		return this.client.reply(toOrMessage as any, messageIdOrContent as any, maybeContent);
	}

	async react(
		messageId: string | bigint | number,
		reaction: ReactionType = "NICE",
	): Promise<void> {
		return this.client.react(messageId, reaction);
	}

	async unsend(messageId: string): Promise<void> {
		return this.client.unsendMessage(messageId);
	}

	async read(
		toOrMessage: SendTarget | Message | { channel?: { id?: string; mid?: string }; to?: string; id?: string },
		lastMessageId?: string,
	): Promise<void> {
		return this.client.read(toOrMessage as any, lastMessageId);
	}

	async markRead(
		toOrMessage: SendTarget | Message | { channel?: { id?: string; mid?: string }; to?: string; id?: string },
		lastMessageId?: string,
	): Promise<void> {
		return this.read(toOrMessage, lastMessageId);
	}
}

export class ChatManager {
	constructor(private readonly client: LineClient) {}

	async list(): Promise<ChatChannel[]> {
		const rawChats = await this.client.getChats();
		return rawChats.map((raw) => new ChatChannel(this.client, raw.chatMid, raw));
	}

	async get(chatMid: string): Promise<ChatChannel> {
		const raw = await this.client.getChat(chatMid);
		return new ChatChannel(this.client, chatMid, raw);
	}

	async create(options: { name?: string; memberMids?: string[] }): Promise<LINETypes.CreateChatResponse> {
		return this.client.createChat(options);
	}

	async invite(chatMid: string, memberMids: string[]): Promise<void> {
		return this.client.inviteToChat(chatMid, memberMids);
	}

	async leave(chatMid: string): Promise<void> {
		return this.client.leaveChat(chatMid);
	}

	async listIds(): Promise<LINETypes.GetAllChatMidsResponse> {
		return this.client.getAllChatMids();
	}
}

export class ContactManager {
	constructor(private readonly client: LineClient) {}

	async list(): Promise<User[]> {
		const rawEntries = await this.client.getContacts();
		return rawEntries.map((e: any) => new User(this.client, e.contact || e));
	}

	async get(userMid: string): Promise<User> {
		const raw = await this.client.getContact(userMid);
		return new User(this.client, raw);
	}

	async add(options: string | AddFriendOptions): Promise<any> {
		return this.client.addFriend(options);
	}

	async find(options: string | FindContactOptions): Promise<LINETypes.Contact> {
		return this.client.findContact(options);
	}

	async block(userMid: string): Promise<void> {
		return this.client.blockContact(userMid);
	}

	async unblock(userMid: string): Promise<void> {
		return this.client.unblockContact(userMid);
	}
}

export class SquareManager {
	constructor(private readonly client: LineClient) {}

	async list(): Promise<LINETypes.Square[]> {
		return this.client.getSquares();
	}

	async send(squareChatMid: string, text: string): Promise<LINETypes.SendMessageResponse> {
		return this.client.sendSquareMessage(squareChatMid, text);
	}

	async join(invitationUrl: string): Promise<LINETypes.JoinSquareResponse> {
		return this.client.joinSquare(invitationUrl);
	}

	async leave(squareMid: string): Promise<void> {
		return this.client.leaveSquare(squareMid);
	}
}

// ====== Public Classes (discord.js inspired) ======

export class User {
	readonly client: LineClient;
	readonly id: string; // mid
	readonly displayName: string;
	readonly statusMessage?: string;
	readonly picturePath?: string;
	readonly raw: any;

	constructor(client: LineClient, raw: any) {
		this.client = client;
		this.id = raw.mid || raw.id;
		this.displayName = raw.displayName || this.id;
		this.statusMessage = raw.statusMessage;
		this.picturePath = raw.picturePath;
		this.raw = raw;
	}

	get avatarUrl(): string {
		return this.picturePath ? `https://profile.line-cdn.net/${this.picturePath}` : "";
	}

	async send(content: MessagePayload): Promise<LINETypes.Message> {
		return this.client.send(this.id, content);
	}

	async addFriend(): Promise<any> {
		return this.client.addFriend(this.id);
	}

	async block(): Promise<void> {
		return this.client.blockContact(this.id);
	}

	async unblock(): Promise<void> {
		return this.client.unblockContact(this.id);
	}
}

export abstract class BaseChannel {
	readonly client: LineClient;
	readonly id: string; // chatMid or squareChatMid

	constructor(client: LineClient, id: string) {
		this.client = client;
		this.id = id;
	}

	abstract send(content: any): Promise<any>;
}

export class ChatChannel extends BaseChannel {
	readonly name?: string;
	readonly raw?: LINETypes.Chat;

	constructor(client: LineClient, id: string, raw?: LINETypes.Chat) {
		super(client, id);
		this.raw = raw;
		this.name = raw?.chatName;
	}

	async send(content: MessagePayload): Promise<LINETypes.Message> {
		return this.client.send(this.id, content);
	}

	async invite(memberMids: string[]): Promise<void> {
		return this.client.inviteToChat(this.id, memberMids);
	}

	async leave(): Promise<void> {
		return this.client.leaveChat(this.id);
	}
}

export class SquareChatChannel extends BaseChannel {
	readonly squareMid?: string;
	readonly name?: string;

	constructor(client: LineClient, id: string, squareMid?: string, name?: string) {
		super(client, id);
		this.squareMid = squareMid;
		this.name = name;
	}

	async send(text: string): Promise<any> {
		return this.client.sendSquareMessage(this.id, text);
	}
}

export abstract class BaseMessage {
	readonly client: LineClient;
	readonly id: string;
	readonly content: string;
	readonly createdAt: Date;
	readonly raw: any;
	private _flexJson?: any;
	private _flexJsonLoaded = false;

	constructor(client: LineClient, raw: any) {
		this.client = client;
		this.id = raw.id;
		this.content = raw.text ?? "";
		this.createdAt = new Date(Number(raw.createdTime || Date.now()));
		this.raw = raw;
	}

	abstract reply(content: any): Promise<any>;

	get text(): string { return this.content; }
	get altText(): string { return this.contentMetadata.ALT_TEXT ?? ""; }
	get flexJson(): any | undefined {
		if (!this._flexJsonLoaded) {
			this._flexJsonLoaded = true;
			const json = this.contentMetadata.FLEX_JSON;
			if (json) {
				try {
					this._flexJson = JSON.parse(json);
				} catch {
					this._flexJson = undefined;
				}
			}
		}
		return this._flexJson;
	}
	get displayText(): string { return this.text || this.altText || this.raw.contentPreview || ""; }
	get isFlex(): boolean { return this.contentType === "FLEX" || Boolean(this.contentMetadata.FLEX_JSON); }
	get contentType(): LINETypes.ContentType { return this.raw.contentType; }
	get contentMetadata(): Record<string, string> { return this.raw.contentMetadata ?? {}; }
	get relatedMessageId(): string | undefined { return this.raw.relatedMessageId; }
}

export class Message extends BaseMessage {
	readonly author: User;
	readonly channel: ChatChannel;

	constructor(opts: { client: LineClient; raw: LINETypes.Message; author: User; channel: ChatChannel }) {
		super(opts.client, opts.raw);
		this.author = opts.author;
		this.channel = opts.channel;
	}

	/** @deprecated Use message.author.id instead */
	get from(): string { return this.author.id; }
	/** @deprecated Use message.channel.id instead */
	get to(): string { return this.channel.id; }

	async reply(content: MessagePayload): Promise<LINETypes.Message> {
		return this.client.reply(this.channel.id, this.id, content);
	}

	async send(content: MessagePayload): Promise<LINETypes.Message> {
		return this.channel.send(content);
	}

	async react(reaction: ReactionType = "NICE"): Promise<void> {
		return this.client.react(this.id, reaction);
	}

	async unsend(): Promise<void> {
		return this.client.unsendMessage(this.id);
	}

	async read(): Promise<void> {
		return this.client.sendChatChecked(this.channel.id, this.id);
	}
}

export { Message as TalkMessage };

export class SquareMessage extends BaseMessage {
	readonly authorMid: string;
	readonly channel: SquareChatChannel;

	constructor(opts: { client: LineClient; raw: any; channel: SquareChatChannel }) {
		super(opts.client, opts.raw);
		this.authorMid = opts.raw.senderMemberMid;
		this.channel = opts.channel;
	}

	/** @deprecated Use message.channel.id instead */
	get squareChatMid(): string { return this.channel.id; }

	async reply(text: string): Promise<any> {
		return this.channel.send(text);
	}
}

// ====== LineClient ======

export class LineClient {
	readonly base: BaseClient;
	readonly api: LineClientApi;
	readonly messages: MessageManager;
	readonly chats: ChatManager;
	readonly contacts: ContactManager;
	readonly squares: SquareManager;
	private _storage: BaseStorage;
	private _loggedIn: boolean = false;
	private readonly _rememberPath?: string;
	private readonly _rememberMeSecret?: string;
	private _abortController: AbortController = new AbortController();
	private _destroyed: boolean = false;

	constructor(options: LineClientOptions = {}) {
		const device = options.device || "DESKTOPWIN";
		this._rememberPath = resolveRememberPath(options.rememberMe);
		this._rememberMeSecret = options.rememberMeSecret;
		const rememberStoragePath = resolveRememberStoragePath(options.rememberMe);
		const storage = options.storage !== undefined
			? (options.storage === false
				? (rememberStoragePath
					? new FileStorage(rememberStoragePath)
					: new MemoryStorage())
				: new FileStorage(options.storage))
			: (rememberStoragePath
				? new FileStorage(rememberStoragePath)
				: new MemoryStorage());

		this._storage = storage;

		this.base = new BaseClient({
			device,
			version: options.version,
			endpoint: options.endpoint,
			storage,
			legy: { encrypted: "auto" },
		});

		if (this._rememberPath) {
			this.base.on("update:authtoken" as any, (token: string) => {
				void writeRememberedToken(this._rememberPath!, token, this._rememberMeSecret).catch(() => {});
			});
		}

		this.messages = new MessageManager(this);
		this.chats = new ChatManager(this);
		this.contacts = new ContactManager(this);
		this.squares = new SquareManager(this);

		this.api = {
			auth: {
				login: (options?: string | LineClientOptions) => this.login(options),
			},
			profile: {
				get: () => this.getMyProfile(),
				update: (update: { displayName?: string; statusMessage?: string }) => this.updateMyProfile(update),
			},
			messages: this.messages,
			chats: {
				list: () => this.getChats(),
				get: (chatMid: string) => this.getChat(chatMid),
				create: (options: { name?: string; memberMids?: string[] }) => this.createChat(options),
				invite: (chatMid: string, memberMids: string[]) => this.inviteToChat(chatMid, memberMids),
				leave: (chatMid: string) => this.leaveChat(chatMid),
				listIds: () => this.getAllChatMids(),
			},
			contacts: {
				list: () => this.getContacts(),
				get: (userMid: string) => this.getContact(userMid),
				add: (options: string | AddFriendOptions) => this.addFriend(options),
				find: (options: string | FindContactOptions) => this.findContact(options),
				block: (userMid: string) => this.blockContact(userMid),
				unblock: (userMid: string) => this.unblockContact(userMid),
			},
			squares: this.squares,
			listen: {
				start: (options?: ListenOptions) => this.listen(options ?? { talk: true, square: true, mode: "push" }),
			},
			system: {
				getServerTime: () => this.getServerTime(),
				noop: () => this.noop(),
				close: () => this.close(),
				destroy: () => this.destroy(),
			},
		};
	}

	// ====== Properties ======

	get device(): Device { return this.base.device; }
	get endpoint(): string { return this.base.endpoint; }
	get storage(): BaseStorage { return this._storage; }
	get authToken(): string | undefined { return this.base.authToken; }
	get profile(): LINETypes.Profile | undefined { return this.base.profile; }
	get isLoggedIn(): boolean { return this._loggedIn; }
	get isDestroyed(): boolean { return this._destroyed; }
	get poll(): Polling { return this.base.poll; }
	get talk(): TalkService { return this.base.talk; }
	get relation(): RelationService { return this.base.relation; }
	private _buddy?: BuddyService;
	get buddy(): BuddyService {
		if (!this._buddy) {
			this._buddy = new BuddyService(this.base);
		}
		return this._buddy;
	}
	get e2ee(): E2EE { return this.base.e2ee; }
	get obs(): LineObs { return this.base.obs; }

	// ====== Lifecycle & Teardown ======

	async close(): Promise<void> {
		if (this._destroyed) return;
		this._destroyed = true;
		this._loggedIn = false;

		try {
			this._abortController.abort();
		} catch {}

		try {
			this.base.push?.opStream?.close();
		} catch {}
		try {
			this.base.push?.sqStream?.close();
		} catch {}

		this.emit("close");
		this.removeAllListeners();
	}

	async destroy(): Promise<void> {
		return this.close();
	}

	// ====== Login ======

	private async ensureE2EEKeyPair(): Promise<void> {
		try {
			await this.base.e2ee.getE2EESelfKeyData(this.base.profile!.mid);
		} catch {
			await this.base.e2ee.registerE2EEKeyPair();
		}
	}

	async login(authTokenOrOptions?: string | LineClientOptions): Promise<LINETypes.Profile> {
		this._abortController = new AbortController();
		this._destroyed = false;
		const options: LineClientOptions =
			typeof authTokenOrOptions === "string"
				? { authToken: authTokenOrOptions }
				: (authTokenOrOptions ?? {});
		const secret = options?.rememberMeSecret ?? this._rememberMeSecret;
		if (options?.authToken) {
			await this.base.loginProcess.login({ authToken: options.authToken });
			this._loggedIn = true;
			await this.ensureE2EEKeyPair();
			if (this._rememberPath && this.base.authToken) {
				await writeRememberedToken(this._rememberPath, this.base.authToken, secret);
			}
			this.emit("ready", this.base.profile!);
			return this.base.profile!;
		}

		const rememberPath = resolveRememberPath(options?.rememberMe) ?? this._rememberPath;
		if (rememberPath) {
			const rememberedToken = await readRememberedToken(rememberPath, secret);
			if (rememberedToken) {
				try {
					await this.base.loginProcess.login({ authToken: rememberedToken });
					this._loggedIn = true;
					await this.ensureE2EEKeyPair();
					this.emit("ready", this.base.profile!);
					return this.base.profile!;
				} catch {
					// Fall through to the explicit login flow.
				}
			}
		}

		if (options?.mail && options?.pass) {
			await this.base.loginProcess.login({
				email: options.mail,
				password: options.pass,
				pincode: options.pincode,
				e2ee: options.e2ee ?? true,
			});
		} else {
			await this.base.loginProcess.login({ qr: true });
		}
		this._loggedIn = true;
		await this.ensureE2EEKeyPair();
		if (rememberPath && this.base.authToken) {
			await writeRememberedToken(rememberPath, this.base.authToken, secret);
		}
		this.emit("ready", this.base.profile!);
		return this.base.profile!;
	}

	static async loginWithQR(
		options: {
			onQR?: (url: string) => void;
			onPin?: (pin: string) => void;
		} & Partial<LineClientOptions>,
	): Promise<LineClient> {
		const client = new LineClient(options);
		const rememberPath = resolveRememberPath(options.rememberMe) ?? client._rememberPath;
		const secret = options.rememberMeSecret ?? client._rememberMeSecret;

		if (options.authToken) {
			await client.base.loginProcess.login({ authToken: options.authToken });
			client._loggedIn = true;
			await client.ensureE2EEKeyPair();
			if (rememberPath && client.base.authToken) {
				await writeRememberedToken(rememberPath, client.base.authToken, secret);
			}
			client.emit("ready", client.base.profile!);
			return client;
		}

		if (rememberPath) {
			const rememberedToken = await readRememberedToken(rememberPath, secret);
			if (rememberedToken) {
				try {
					await client.base.loginProcess.login({ authToken: rememberedToken });
					client._loggedIn = true;
					await client.ensureE2EEKeyPair();
					client.emit("ready", client.base.profile!);
					return client;
				} catch {
					// Fall through to QR login.
				}
			}
		}

		if (options.onQR) {
			client.base.on("qrcall", (url: string) => options.onQR!(url));
		}
		if (options.onPin) {
			client.base.on("pincall", (pin: string) => options.onPin!(pin));
		}

		await client.base.loginProcess.login({ qr: true });
		client._loggedIn = true;
		await client.ensureE2EEKeyPair();
		if (rememberPath && client.base.authToken) {
			await writeRememberedToken(rememberPath, client.base.authToken, secret);
		}
		client.emit("ready", client.base.profile!);
		return client;
	}

	// ====== Profile ======

	async getMyProfile(): Promise<LINETypes.Profile> {
		this.ensureLoggedIn();
		return await this.base.talk.getProfile();
	}

	async updateMyProfile(update: { displayName?: string; statusMessage?: string }): Promise<void> {
		this.ensureLoggedIn();
		const profile = await this.getMyProfile();
		const attr: number[] = [];
		const updatedProfile: any = { mid: profile.mid };
		if (update.displayName !== undefined) {
			updatedProfile.displayName = update.displayName;
			attr.push(2, 4);
		}
		if (update.statusMessage !== undefined) {
			updatedProfile.statusMessage = update.statusMessage;
			attr.push(8);
		}
		await this.base.request.request(
			[[12, 2, [15, 2, [[12, 2, updatedProfile], [15, 12, [8, attr]]]]]] as any,
			"updateProfile",
			4,
			true,
			"/S4",
		);
	}

	// ====== Messages ======

	async send(to: SendTarget, content: MessagePayload): Promise<LINETypes.Message> {
		const targetMid = resolveSendTarget(to);
		if (typeof content === "string") {
			return this.sendMessage(targetMid, content);
		}
		if ("flex" in content && content.flex) {
			return this.sendFlex(targetMid, content.altText || "Flex Message", content.flex, content.replyTo);
		}
		if ("image" in content && content.image) {
			return this.sendImage(targetMid, content.image);
		}
		if ("video" in content && content.video) {
			return this.sendVideo(targetMid, content.video);
		}
		if ("audio" in content && content.audio) {
			return this.sendAudio(targetMid, content.audio);
		}
		if ("file" in content && content.file) {
			return this.sendFile(targetMid, content.file, content.filename);
		}
		if ("sticker" in content && content.sticker) {
			if (typeof content.sticker === "string") {
				return this.sendSticker(targetMid, content.sticker, "1", "100", content.replyTo);
			}
			return this.sendSticker(
				targetMid,
				content.sticker.stickerId,
				content.sticker.packageId || "1",
				content.sticker.version || "100",
				content.replyTo,
			);
		}
		if ("location" in content && content.location) {
			return this.sendLocation(targetMid, content.location, content.replyTo);
		}
		if ("text" in content && content.text) {
			return this.sendMessage(targetMid, content.text, content.replyTo);
		}
		throw new Error("Invalid message payload: no recognized content (text, flex, image, sticker, etc.)");
	}

	async reply(
		toOrMessage: SendTarget | Message | { channel?: { id?: string; mid?: string }; to?: string; id: string },
		messageIdOrContent: string | MessagePayload,
		maybeContent?: MessagePayload,
	): Promise<LINETypes.Message> {
		let targetTo: SendTarget;
		let replyMessageId: string;
		let payload: MessagePayload;

		if (typeof toOrMessage === "object" && toOrMessage !== null && "id" in toOrMessage && (toOrMessage as any).id) {
			targetTo =
				(toOrMessage as any).channel?.id ||
				(toOrMessage as any).channel?.mid ||
				(toOrMessage as any).to ||
				(toOrMessage as any).from ||
				"";
			replyMessageId = (toOrMessage as any).id;
			payload = messageIdOrContent as MessagePayload;
		} else if (maybeContent !== undefined) {
			targetTo = toOrMessage as SendTarget;
			replyMessageId = messageIdOrContent as string;
			payload = maybeContent;
		} else {
			throw new Error("reply requires both target chat and message ID (e.g. client.reply(message, content) or client.reply(chatId, messageId, content))");
		}

		const targetMid = resolveSendTarget(targetTo);

		if (typeof payload === "string") {
			return this.sendMessage(targetMid, payload, replyMessageId);
		}
		return this.send(targetMid, {
			...payload,
			replyTo: replyMessageId,
		});
	}

	async sendMessage(to: SendTarget, text: string, replyTo?: string): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		const targetMid = resolveSendTarget(to);
		return await this.base.talk.sendMessage({
			to: targetMid,
			text,
			...(replyTo ? { relatedMessageId: replyTo } : {}),
		});
	}

	async sendCompactMessage(to: SendTarget, text: string): Promise<CompactMessageResponse> {
		this.ensureLoggedIn();
		const targetMid = resolveSendTarget(to);
		return await this.base.talk.sendCompactMessage({ to: targetMid, text });
	}

	async unsendMessage(messageId: string): Promise<void> {
		this.ensureLoggedIn();
		await this.base.talk.unsendMessage({ messageId });
	}

	async react(
		messageId: string | bigint | number,
		reaction: ReactionType = "NICE",
	): Promise<void> {
		this.ensureLoggedIn();
		const reactionTypeMap: Record<string, number> = {
			ALL: 0,
			UNDO: 1,
			NICE: 2,
			LOVE: 3,
			FUN: 4,
			AMAZING: 5,
			SAD: 6,
			OMG: 7,
		};
		const reactionVal = typeof reaction === "string" ? (reactionTypeMap[reaction] ?? 2) : reaction;
		const id = typeof messageId === "string" ? BigInt(messageId) : (typeof messageId === "number" ? BigInt(messageId) : messageId);
		await this.base.talk.react({
			id: id as any,
			reaction: reactionVal as any,
		});
	}

	async sendChatChecked(chatMid: SendTarget, lastMessageId: string): Promise<void> {
		this.ensureLoggedIn();
		const targetMid = resolveSendTarget(chatMid);
		await this.base.talk.sendChatChecked({ chatMid: targetMid, lastMessageId });
	}

	async read(
		toOrMessage: SendTarget | Message | { channel?: { id?: string; mid?: string }; to?: string; id?: string },
		lastMessageId?: string,
	): Promise<void> {
		if (
			typeof toOrMessage === "object" &&
			toOrMessage !== null &&
			"id" in toOrMessage &&
			(toOrMessage as any).id &&
			!lastMessageId
		) {
			const chatMid =
				(toOrMessage as any).channel?.id ||
				(toOrMessage as any).channel?.mid ||
				(toOrMessage as any).to ||
				(toOrMessage as any).from;
			return this.sendChatChecked(resolveSendTarget(chatMid), (toOrMessage as any).id);
		}
		const chatMid = resolveSendTarget(toOrMessage as SendTarget);
		if (!lastMessageId) {
			throw new Error("read requires a messageId when passing chat target (e.g. client.read(chatMid, messageId) or client.read(message))");
		}
		return this.sendChatChecked(chatMid, lastMessageId);
	}

	async sendImage(to: SendTarget, data: MediaInput): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		const targetMid = resolveSendTarget(to);
		const { blob } = await resolveMediaBlob(data);
		return await this.base.obs.uploadMediaByE2EE({ data: blob, oType: "image", to: targetMid });
	}

	async sendVideo(to: SendTarget, data: MediaInput): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		const targetMid = resolveSendTarget(to);
		const { blob } = await resolveMediaBlob(data);
		return await this.base.obs.uploadMediaByE2EE({ data: blob, oType: "video", to: targetMid });
	}

	async sendAudio(to: SendTarget, data: MediaInput): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		const targetMid = resolveSendTarget(to);
		const { blob } = await resolveMediaBlob(data);
		return await this.base.obs.uploadMediaByE2EE({ data: blob, oType: "audio", to: targetMid });
	}

	async sendFile(to: SendTarget, data: MediaInput, filename?: string): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		const targetMid = resolveSendTarget(to);
		const resolved = await resolveMediaBlob(data, filename);
		return await this.base.obs.uploadMediaByE2EE({
			data: resolved.blob,
			oType: "file",
			to: targetMid,
			filename: filename || resolved.filename,
		});
	}

	async sendLocation(
		to: SendTarget,
		location: { title: string; address?: string; latitude: number; longitude: number },
		replyTo?: string,
	): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		const targetMid = resolveSendTarget(to);
		return await this.base.talk.sendMessage({
			to: targetMid,
			contentType: "LOCATION",
			location: location as any,
			...(replyTo ? { relatedMessageId: replyTo } : {}),
		});
	}

	async sendSticker(
		to: SendTarget,
		stickerId: string,
		packageId: string = "1",
		version: string = "100",
		replyTo?: string,
	): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		const targetMid = resolveSendTarget(to);
		return await this.base.talk.sendMessage({
			to: targetMid,
			contentType: "STICKER",
			contentMetadata: { STKID: stickerId, STKVER: version, STKPKGID: packageId },
			...(replyTo ? { relatedMessageId: replyTo } : {}),
		});
	}

	async sendFlex(to: SendTarget, altText: string, flexJson: any, replyTo?: string): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		const targetMid = resolveSendTarget(to);
		return await this.base.talk.sendMessage({
			to: targetMid,
			contentType: "FLEX",
			contentMetadata: {
				ALTTEXT: altText,
				FLEXCONTAINER: typeof flexJson === "string" ? flexJson : JSON.stringify(flexJson),
			},
			...(replyTo ? { relatedMessageId: replyTo } : {}),
		});
	}

	// ====== Chat ======

	async getChats(): Promise<LINETypes.Chat[]> {
		this.ensureLoggedIn();
		const joined = await this.base.talk.getAllChatMids(
			{ request: { withMemberChats: true } },
		);
		const { chats } = await this.base.talk.getChats({
			chatMids: joined.memberChatMids,
		});
		return chats;
	}

	async getChat(chatMid: string): Promise<LINETypes.Chat> {
		this.ensureLoggedIn();
		return await this.base.talk.getChat({
			chatMid,
			withInvitees: true,
			withMembers: true,
		});
	}

	async createChat(options: {
		name?: string;
		memberMids?: string[];
	}): Promise<LINETypes.CreateChatResponse> {
		this.ensureLoggedIn();
		return await this.base.talk.createChat({
			request: {
				name: options.name ?? "",
				mids: options.memberMids ?? [],
			} as any,
		});
	}

	async inviteToChat(chatMid: string, memberMids: string[]): Promise<void> {
		this.ensureLoggedIn();
		await this.base.talk.inviteIntoChat({ chatMid, targetUserMids: memberMids });
	}

	async leaveChat(chatMid: string): Promise<void> {
		this.ensureLoggedIn();
		await this.base.talk.deleteSelfFromChat({ request: { chatMid } });
	}

	async getAllChatMids(): Promise<LINETypes.GetAllChatMidsResponse> {
		this.ensureLoggedIn();
		return await this.base.talk.getAllChatMids(
			{ request: { withMemberChats: true, withInvitedChats: true } },
		);
	}

	// ====== Friends ======

	async addFriend(options: string | AddFriendOptions): Promise<any> {
		this.ensureLoggedIn();
		if (typeof options === "string") {
			const trimmed = options.trim();
			if (trimmed.startsWith("u") && trimmed.length === 33) {
				return await this.relation.addFriendByMid({ mid: trimmed });
			}
			return await this.relation.addFriendByUserId({ userId: trimmed });
		}
		if (options.mid) {
			return await this.relation.addFriendByMid({
				mid: options.mid,
				reference: options.reference,
			});
		}
		if (options.userId || options.searchId) {
			return await this.relation.addFriendByUserId({
				userId: options.userId || options.searchId!,
			});
		}
		if (options.phone) {
			return await this.relation.addFriendByPhone({
				phone: options.phone,
			});
		}
		throw new Error("addFriend requires at least mid, userId, searchId, or phone");
	}

	async findContact(options: string | FindContactOptions): Promise<LINETypes.Contact> {
		this.ensureLoggedIn();
		if (typeof options === "string") {
			const trimmed = options.trim();
			if (trimmed.startsWith("u") && trimmed.length === 33) {
				return await this.getContact(trimmed);
			}
			if (trimmed.startsWith("+")) {
				return await this.relation.findContactByPhoneV3({ phone: trimmed });
			}
			return await this.relation.findContactBySearchIdOrTicketV3({ searchId: trimmed });
		}
		if (options.mid) {
			return await this.getContact(options.mid);
		}
		if (options.phone) {
			return await this.relation.findContactByPhoneV3({ phone: options.phone });
		}
		if (options.searchId || options.userId) {
			return await this.relation.findContactBySearchIdOrTicketV3({
				searchId: options.searchId || options.userId!,
			});
		}
		throw new Error("findContact requires at least mid, searchId, userId, or phone");
	}

	async getContacts(): Promise<LINETypes.ContactEntry[]> {
		this.ensureLoggedIn();
		const ids = await this.base.talk.getAllContactIds();
		const res = await this.base.talk.getContactsV2({ mids: ids });
		return Object.values(res.contacts ?? {});
	}

	async getContact(userMid: string): Promise<LINETypes.Contact> {
		this.ensureLoggedIn();
		return await this.base.talk.getContact({ mid: userMid });
	}

	async blockContact(userMid: string): Promise<void> {
		this.ensureLoggedIn();
		await this.base.talk.blockContact({ id: userMid });
	}

	async unblockContact(userMid: string): Promise<void> {
		this.ensureLoggedIn();
		await this.base.talk.unblockContact({ id: userMid });
	}

	// ====== Square (OpenChat) ======

	async getSquares(): Promise<LINETypes.Square[]> {
		this.ensureLoggedIn();
		const response = await continueRequest({
			handler: (arg) => this.base.square.getJoinedSquares(arg),
			arg: { limit: 100 },
		});
		return response.squares;
	}

	async sendSquareMessage(squareChatMid: string, text: string): Promise<LINETypes.SendMessageResponse> {
		this.ensureLoggedIn();
		return await this.base.square.sendMessage({
			squareChatMid,
			text,
		});
	}

	async joinSquare(invitationUrl: string): Promise<LINETypes.JoinSquareResponse> {
		this.ensureLoggedIn();
		return await this.base.square.joinSquare({ invitationUrl } as any);
	}

	async leaveSquare(squareMid: string): Promise<void> {
		this.ensureLoggedIn();
		await this.base.square.leaveSquare({ request: { squareMid } });
	}

	// ====== Listen ======

	listen(opts: ListenOptions = { talk: true, square: true, mode: "push" }): void {
		this.ensureLoggedIn();
		const mode = opts.mode ?? "push";
		const callerSignal = opts.signal;
		const isAborted = () => Boolean(callerSignal?.aborted || this._abortController.signal.aborted);

		const buildTalkMessage = async (raw: LINETypes.Message): Promise<Message> => {
			let authorUser: User;
			try {
				const sender = await this.getContact(raw.from);
				authorUser = new User(this, sender);
			} catch {
				authorUser = new User(this, { id: raw.from });
			}
			const isDirectUserMessage = raw.to === this.profile?.mid || (raw.toType as any) === "USER" || (raw.toType as any) === 0;
			const targetChatMid = isDirectUserMessage ? raw.from : raw.to;
			const channel = new ChatChannel(this, targetChatMid);
			return new Message({
				client: this,
				raw,
				author: authorUser,
				channel,
			});
		};

		const closeStreams = () => {
			try { this.base.push?.opStream?.close(); } catch {}
			try { this.base.push?.sqStream?.close(); } catch {}
		};
		callerSignal?.addEventListener("abort", closeStreams);
		this._abortController.signal.addEventListener("abort", closeStreams);

		const decryptAndEmit = async (event: any) => {
			if (!event?.message) return;
			try {
				const msg = await this.base.e2ee.decryptE2EEMessage(event.message);
				this.base.emit("message" as any, await buildTalkMessage(msg));
			} catch (error) {
				try {
					const chunks = event.message?.chunks;
					if (chunks && chunks.length >= 4) {
						const chunk3 = typeof chunks[3] === "string" ? Buffer.from(chunks[3], "utf-8") : chunks[3];
						if (chunk3 && chunk3.length > 0) {
							const senderKeyId = byte2int(chunk3);
							if (senderKeyId !== undefined) {
								await this.base.storage.delete(`e2eePublicKeys:${senderKeyId}`);
							}
						}
					}
					if (error instanceof Error && error.message.includes("E2EE Key has not been saved")) {
						await this.ensureE2EEKeyPair();
					}
					const msg = await this.base.e2ee.decryptE2EEMessage(event.message);
					this.base.emit("message" as any, await buildTalkMessage(msg));
					return;
				} catch (retryError) {
					this.base.emit("log" as any, {
						type: "listen:decrypt:retry:error",
						data: retryError,
					});
				}
				this.base.emit("log" as any, {
					type: "listen:decrypt:error",
					data: error,
				});
				// Fallback: emit the raw message so plain-text or unencrypted messages are never lost
				try {
					this.base.emit("message" as any, await buildTalkMessage(event.message));
				} catch {}
			}
		};

		if (opts.talk) {
			(async () => {
				let retryCount = 0;
				while (!isAborted()) {
					try {
						if (mode === "push") {
							const stream = this.base.poll.listenTalkEvents();
							const reader = stream.getReader();
							const cancelReader = () => {
								try { reader.cancel(); } catch {}
							};
							callerSignal?.addEventListener("abort", cancelReader);
							this._abortController.signal.addEventListener("abort", cancelReader);
							try {
								while (!isAborted()) {
									const { done, value: event } = await reader.read();
									if (done) break;
									if (!event) continue;
									retryCount = 0;
									this.base.emit("event" as any, event);
									if (
										event.type === "SEND_MESSAGE" ||
										event.type === "RECEIVE_MESSAGE" ||
										(event.type as any) === 25 ||
										(event.type as any) === 26 ||
										Boolean(event.message)
									) {
										await decryptAndEmit(event);
									}
								}
							} finally {
								callerSignal?.removeEventListener("abort", cancelReader);
								this._abortController.signal.removeEventListener("abort", cancelReader);
								reader.releaseLock();
							}
						} else {
							for await (const event of (this.base.poll as any)._listenTalkEvents({
								signal: callerSignal || this._abortController.signal,
								pollingInterval: opts.pollingInterval ?? 1000,
							})) {
								if (isAborted()) break;
								retryCount = 0;
								this.base.emit("event" as any, event);
								if (
									event.type === "SEND_MESSAGE" ||
									event.type === "RECEIVE_MESSAGE" ||
									(event.type as any) === 25 ||
									(event.type as any) === 26 ||
									Boolean(event.message)
								) {
									await decryptAndEmit(event);
								}
							}
						}
					} catch (error) {
						this.base.emit("log" as any, {
							type: "listen:talk:error",
							data: error,
						});
						this.emit("error", error);
						retryCount++;
						const backoffDelay = Math.min(1000 * Math.pow(1.5, retryCount), 5000);
						if (!isAborted()) {
							await new Promise((r) => setTimeout(r, backoffDelay));
						}
					}
					if (!isAborted()) {
						await new Promise((r) => setTimeout(r, 1000));
					}
				}
			})();
		}

		if (opts.square) {
			(async () => {
				let retryCount = 0;
				while (!isAborted()) {
					try {
						if (mode === "push") {
							const stream = this.base.poll.listenSquareEvents();
							const reader = stream.getReader();
							const cancelReader = () => {
								try { reader.cancel(); } catch {}
							};
							callerSignal?.addEventListener("abort", cancelReader);
							this._abortController.signal.addEventListener("abort", cancelReader);
							try {
								while (!isAborted()) {
									const { done, value: event } = await reader.read();
									if (done) break;
									if (!event) continue;
									retryCount = 0;
									this.base.emit("square:event" as any, event);
									if (event.type === "NOTIFICATION_MESSAGE") {
										const sqMsg = event.payload.notificationMessage.squareMessage;
										const channel = new SquareChatChannel(this, event.payload.notificationMessage.squareChatMid);
										this.base.emit(
											"square:message" as any,
											new SquareMessage({
												raw: sqMsg,
												client: this,
												channel,
											}),
										);
									}
								}
							} finally {
								callerSignal?.removeEventListener("abort", cancelReader);
								this._abortController.signal.removeEventListener("abort", cancelReader);
								reader.releaseLock();
							}
						} else {
							for await (const event of (this.base.poll as any)._listenSquareEvents({
								signal: callerSignal || this._abortController.signal,
								pollingInterval: 1000,
							})) {
								if (isAborted()) break;
								retryCount = 0;
								this.base.emit("square:event" as any, event);
								if (event.type === "NOTIFICATION_MESSAGE") {
									const sqMsg = event.payload.notificationMessage.squareMessage;
									const channel = new SquareChatChannel(this, event.payload.notificationMessage.squareChatMid);
									this.base.emit(
										"square:message" as any,
										new SquareMessage({
											raw: sqMsg,
											client: this,
											channel,
										}),
									);
								}
							}
						}
					} catch (error) {
						this.base.emit("log" as any, {
							type: "listen:square:error",
							data: error,
						});
						this.emit("error", error);
						retryCount++;
						const backoffDelay = Math.min(1000 * Math.pow(1.5, retryCount), 5000);
						if (!isAborted()) {
							await new Promise((r) => setTimeout(r, backoffDelay));
						}
					}
					if (!isAborted()) {
						await new Promise((r) => setTimeout(r, 1000));
					}
				}
			})();
		}
	}

	// ====== Events ======

	on<K extends keyof ClientEvents>(event: K, listener: ClientEvents[K]): this {
		this.base.on(event as any, listener as any);
		return this;
	}

	once<K extends keyof ClientEvents>(event: K, listener: ClientEvents[K]): this {
		this.base.once(event as any, listener as any);
		return this;
	}

	off<K extends keyof ClientEvents>(event: K, listener: ClientEvents[K]): this {
		this.base.off(event as any, listener as any);
		return this;
	}

	addListener<K extends keyof ClientEvents>(event: K, listener: ClientEvents[K]): this {
		return this.on(event, listener);
	}

	removeListener<K extends keyof ClientEvents>(event: K, listener: ClientEvents[K]): this {
		return this.off(event, listener);
	}

	removeAllListeners<K extends keyof ClientEvents>(event?: K): this {
		this.base.removeAllListeners(event as any);
		return this;
	}

	emit<K extends keyof ClientEvents>(event: K, ...args: Parameters<ClientEvents[K]>): boolean {
		this.base.emit(event as any, ...args as any);
		return true;
	}

	// ====== Low-level ======

	async getServerTime(): Promise<number> {
		this.ensureLoggedIn();
		return await this.base.talk.getServerTime();
	}

	async noop(): Promise<void> {
		this.ensureLoggedIn();
		await this.base.talk.noop();
	}

	// ====== Internal ======

	private ensureLoggedIn(): void {
		if (!this._loggedIn) {
			throw new Error("Not logged in. Call login() first.");
		}
	}

	static jsonReplacer(k: string, v: any): any {
		return BaseClient.jsonReplacer(k, v);
	}
}
