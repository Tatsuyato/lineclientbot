import { BaseClient, type ClientInit, type LoginOption } from "./base/core/mod.js";
import type { Device } from "./types/devices.js";
import { getDeviceDetails } from "./types/devices.js";
import { BaseStorage, MemoryStorage, FileStorage } from "./base/storage/mod.js";
import type { Polling } from "./base/polling/mod.js";
import { continueRequest } from "./base/core/mod.js";
import type * as LINETypes from "./types/line/line_types.js";
import type { CompactMessageResponse } from "./base/service/talk/mod.js";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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
	message: (message: Message) => void;
	event: (event: LINETypes.Operation) => void;
	"square:message": (message: SquareMessage) => void;
	"square:event": (event: LINETypes.SquareEvent) => void;
	log: (data: { type: string; data: any }) => void;
};

export interface ListenOptions {
	talk?: boolean;
	square?: boolean;
	signal?: AbortSignal;
	mode?: "push" | "poll";
}

export interface LineClientApi {
	auth: {
		login: (options?: LineClientOptions) => Promise<LINETypes.Profile>;
	};
	profile: {
		get: () => Promise<LINETypes.Profile>;
		update: (update: { displayName?: string; statusMessage?: string }) => Promise<void>;
	};
	messages: {
		sendText: (to: string, text: string) => Promise<LINETypes.Message>;
		sendCompact: (to: string, text: string) => Promise<CompactMessageResponse>;
		sendImage: (to: string, data: Buffer | Blob) => Promise<LINETypes.Message>;
		sendVideo: (to: string, data: Buffer | Blob) => Promise<LINETypes.Message>;
		sendAudio: (to: string, data: Buffer | Blob) => Promise<LINETypes.Message>;
		sendFile: (to: string, data: Buffer | Blob, filename: string) => Promise<LINETypes.Message>;
		sendLocation: (
			to: string,
			location: { title: string; address: string; latitude: number; longitude: number },
		) => Promise<LINETypes.Message>;
		sendSticker: (to: string, stickerId: string) => Promise<LINETypes.Message>;
		sendFlex: (to: string, altText: string, flexJson: any) => Promise<LINETypes.Message>;
		unsend: (messageId: string) => Promise<void>;
		markRead: (chatMid: string, lastMessageId: string) => Promise<void>;
	};
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
		block: (userMid: string) => Promise<void>;
		unblock: (userMid: string) => Promise<void>;
	};
	squares: {
		list: () => Promise<LINETypes.Square[]>;
		send: (squareChatMid: string, text: string) => Promise<LINETypes.SendMessageResponse>;
		join: (invitationUrl: string) => Promise<LINETypes.JoinSquareResponse>;
		leave: (squareMid: string) => Promise<void>;
	};
	listen: {
		start: (options?: ListenOptions) => void;
	};
	system: {
		getServerTime: () => Promise<number>;
		noop: () => Promise<void>;
	};
}

// ====== Public Classes (discord.js inspired) ======

export class User {
	readonly client: LineClient;
	readonly id: string; // mid
	readonly displayName: string;
	readonly statusMessage?: string;
	readonly picturePath?: string;

	constructor(client: LineClient, raw: any) {
		this.client = client;
		this.id = raw.mid || raw.id;
		this.displayName = raw.displayName || this.id;
		this.statusMessage = raw.statusMessage;
		this.picturePath = raw.picturePath;
	}

	get avatarUrl(): string {
		return this.picturePath ? `https://profile.line-cdn.net/${this.picturePath}` : "";
	}

	async send(text: string): Promise<LINETypes.Message> {
		return this.client.sendMessage(this.id, text);
	}
}

export abstract class BaseChannel {
	readonly client: LineClient;
	readonly id: string; // chatMid or squareChatMid

	constructor(client: LineClient, id: string) {
		this.client = client;
		this.id = id;
	}

	abstract send(text: string): Promise<any>;
}

export class ChatChannel extends BaseChannel {
	readonly name?: string;
	readonly raw?: LINETypes.Chat;

	constructor(client: LineClient, id: string, raw?: LINETypes.Chat) {
		super(client, id);
		this.raw = raw;
		this.name = raw?.chatName;
	}

	async send(text: string): Promise<LINETypes.Message> {
		return this.client.sendMessage(this.id, text);
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

	abstract reply(text: string): Promise<any>;

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

	async reply(text: string): Promise<LINETypes.Message> {
		return this.channel.send(text);
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
	private _storage: BaseStorage;
	private _loggedIn: boolean = false;
	private readonly _rememberPath?: string;
	private readonly _rememberMeSecret?: string;

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
			this.base.on("update:authtoken", (token: string) => {
				void writeRememberedToken(this._rememberPath!, token, this._rememberMeSecret).catch(() => {});
			});
		}

		this.api = {
			auth: {
				login: (options?: LineClientOptions) => this.login(options),
			},
			profile: {
				get: () => this.getMyProfile(),
				update: (update: { displayName?: string; statusMessage?: string }) => this.updateMyProfile(update),
			},
			messages: {
				sendText: (to: string, text: string) => this.sendMessage(to, text),
				sendCompact: (to: string, text: string) => this.sendCompactMessage(to, text),
				sendImage: (to: string, data: Buffer | Blob) => this.sendImage(to, data),
				sendVideo: (to: string, data: Buffer | Blob) => this.sendVideo(to, data),
				sendAudio: (to: string, data: Buffer | Blob) => this.sendAudio(to, data),
				sendFile: (to: string, data: Buffer | Blob, filename: string) => this.sendFile(to, data, filename),
				sendLocation: (
					to: string,
					location: { title: string; address: string; latitude: number; longitude: number },
				) => this.sendLocation(to, location),
				sendSticker: (to: string, stickerId: string) => this.sendSticker(to, stickerId),
				sendFlex: (to: string, altText: string, flexJson: any) => this.sendFlex(to, altText, flexJson),
				unsend: (messageId: string) => this.unsendMessage(messageId),
				markRead: (chatMid: string, lastMessageId: string) => this.sendChatChecked(chatMid, lastMessageId),
			},
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
				block: (userMid: string) => this.blockContact(userMid),
				unblock: (userMid: string) => this.unblockContact(userMid),
			},
			squares: {
				list: () => this.getSquares(),
				send: (squareChatMid: string, text: string) => this.sendSquareMessage(squareChatMid, text),
				join: (invitationUrl: string) => this.joinSquare(invitationUrl),
				leave: (squareMid: string) => this.leaveSquare(squareMid),
			},
			listen: {
				start: (options?: ListenOptions) => this.listen(options ?? { talk: true, square: true, mode: "push" }),
			},
			system: {
				getServerTime: () => this.getServerTime(),
				noop: () => this.noop(),
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
	get poll(): Polling { return this.base.poll; }

	// ====== Login ======

	private async ensureE2EEKeyPair(): Promise<void> {
		try {
			await this.base.e2ee.getE2EESelfKeyData(this.base.profile!.mid);
		} catch {
			await this.base.e2ee.registerE2EEKeyPair();
		}
	}

	async login(options?: LineClientOptions): Promise<LINETypes.Profile> {
		const secret = options?.rememberMeSecret ?? this._rememberMeSecret;
		if (options?.authToken) {
			await this.base.loginProcess.login({ authToken: options.authToken });
			this._loggedIn = true;
			await this.ensureE2EEKeyPair();
			if (this._rememberPath && this.base.authToken) {
				await writeRememberedToken(this._rememberPath, this.base.authToken, secret);
			}
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
			return client;
		}

		if (rememberPath) {
			const rememberedToken = await readRememberedToken(rememberPath, secret);
			if (rememberedToken) {
				try {
					await client.base.loginProcess.login({ authToken: rememberedToken });
					client._loggedIn = true;
					await client.ensureE2EEKeyPair();
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
		return client;
	}

	// ====== Profile ======

	async getMyProfile(): Promise<LINETypes.Profile> {
		return await this.base.talk.getProfile();
	}

	async updateMyProfile(update: { displayName?: string; statusMessage?: string }): Promise<void> {
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

	async sendMessage(to: string, text: string): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		return await this.base.talk.sendMessage({ to, text });
	}

	async sendCompactMessage(to: string, text: string): Promise<CompactMessageResponse> {
		this.ensureLoggedIn();
		return await this.base.talk.sendCompactMessage({ to, text });
	}

	async unsendMessage(messageId: string): Promise<void> {
		this.ensureLoggedIn();
		await this.base.talk.unsendMessage({ messageId });
	}

	async sendChatChecked(chatMid: string, lastMessageId: string): Promise<void> {
		this.ensureLoggedIn();
		await this.base.talk.sendChatChecked({ chatMid, lastMessageId });
	}

	async sendImage(to: string, data: Buffer | Blob): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		const blob = data instanceof Blob ? data : new Blob([data as any]);
		return await this.base.obs.uploadMediaByE2EE({ data: blob, oType: "image", to });
	}

	async sendVideo(to: string, data: Buffer | Blob): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		const blob = data instanceof Blob ? data : new Blob([data as any]);
		return await this.base.obs.uploadMediaByE2EE({ data: blob, oType: "video", to });
	}

	async sendAudio(to: string, data: Buffer | Blob): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		const blob = data instanceof Blob ? data : new Blob([data as any]);
		return await this.base.obs.uploadMediaByE2EE({ data: blob, oType: "audio", to });
	}

	async sendFile(to: string, data: Buffer | Blob, filename: string): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		const blob = data instanceof Blob ? data : new Blob([data as any]);
		return await this.base.obs.uploadMediaByE2EE({ data: blob, oType: "file", to, filename });
	}

	async sendLocation(
		to: string,
		location: { title: string; address: string; latitude: number; longitude: number },
	): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		return await this.base.talk.sendMessage({
			to,
			contentType: "LOCATION",
			location: location as any,
		});
	}

	async sendSticker(to: string, stickerId: string): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		return await this.base.talk.sendMessage({
			to,
			contentType: "STICKER",
			contentMetadata: { STKID: stickerId, STKVER: "100", STKPKGID: "1" },
		});
	}

	async sendFlex(to: string, altText: string, flexJson: any): Promise<LINETypes.Message> {
		this.ensureLoggedIn();
		return await this.base.talk.sendMessage({
			to,
			contentType: "FLEX",
			contentMetadata: {
				ALTTEXT: altText,
				FLEXCONTAINER: JSON.stringify(flexJson),
			},
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
		const signal = opts.signal;
		const buildTalkMessage = async (raw: LINETypes.Message): Promise<Message> => {
			let authorUser: User;
			try {
				const sender = await this.getContact(raw.from);
				authorUser = new User(this, sender);
			} catch {
				authorUser = new User(this, { id: raw.from });
			}
			const channel = new ChatChannel(this, raw.to);
			return new Message({
				client: this,
				raw,
				author: authorUser,
				channel,
			});
		};

		signal?.addEventListener("abort", () => {
			this.base.push.opStream.close();
			this.base.push.sqStream.close();
		});

		const decryptAndEmit = async (event: any) => {
			try {
				const msg = await this.base.e2ee.decryptE2EEMessage(event.message);
				this.base.emit("message" as any, await buildTalkMessage(msg));
			} catch (error) {
				if (error instanceof Error && error.message.includes("E2EE Key has not been saved")) {
					try {
						await this.ensureE2EEKeyPair();
						const msg = await this.base.e2ee.decryptE2EEMessage(event.message);
						this.base.emit("message" as any, await buildTalkMessage(msg));
						return;
					} catch (retryError) {
						this.base.emit("log" as any, {
							type: "listen:decrypt:retry:error",
							data: retryError,
						});
					}
				}
				this.base.emit("log" as any, {
					type: "listen:decrypt:error",
					data: error,
				});
			}
		};

		if (opts.talk) {
			(async () => {
				if (mode === "push") {
					const stream = this.base.poll.listenTalkEvents();
					const reader = stream.getReader();
					signal?.addEventListener("abort", () => {
						try { reader.cancel(); } catch {}
					});
					try {
						while (true) {
							const { done, value: event } = await reader.read();
							if (done) break;
							if (!event) continue;
							this.base.emit("event" as any, event);
							if (event.type === "SEND_MESSAGE" || event.type === "RECEIVE_MESSAGE") {
								await decryptAndEmit(event);
							}
						}
					} catch (error) {
						this.base.emit("log" as any, {
							type: "listen:talk:error",
							data: error,
						});
					} finally {
						reader.releaseLock();
					}
				} else {
					for await (const event of (this.base.poll as any)._listenTalkEvents({
						signal,
						pollingInterval: 1000,
					})) {
						this.base.emit("event" as any, event);
						if (event.type === "SEND_MESSAGE" || event.type === "RECEIVE_MESSAGE") {
							await decryptAndEmit(event);
						}
					}
				}
			})();
		}

		if (opts.square) {
			(async () => {
				if (mode === "push") {
					const stream = this.base.poll.listenSquareEvents();
					const reader = stream.getReader();
					signal?.addEventListener("abort", () => {
						try { reader.cancel(); } catch {}
					});
					try {
						while (true) {
							const { done, value: event } = await reader.read();
							if (done) break;
							if (!event) continue;
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
					} catch (error) {
						this.base.emit("log" as any, {
							type: "listen:square:error",
							data: error,
						});
					} finally {
						reader.releaseLock();
					}
				} else {
					for await (const event of (this.base.poll as any)._listenSquareEvents({
						signal,
						pollingInterval: 1000,
					})) {
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
			})();
		}
	}

	// ====== Events ======

	on<K extends keyof ClientEvents>(event: K, listener: (...args: ClientEvents[K] extends (...a: infer P) => any ? P : never) => void): this {
		this.base.on(event as any, listener as any);
		return this;
	}

	off<K extends keyof ClientEvents>(event: K, listener: (...args: ClientEvents[K] extends (...a: infer P) => any ? P : never) => void): this {
		this.base.off(event as any, listener as any);
		return this;
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
