import { BaseClient, type ClientInit, type LoginOption } from "./base/core/mod.js";
import type { Device } from "./types/devices.js";
import { getDeviceDetails } from "./types/devices.js";
import { BaseStorage, MemoryStorage, FileStorage } from "./base/storage/mod.js";
import type { Polling } from "./base/polling/mod.js";
import { continueRequest } from "./base/core/mod.js";
import type * as LINETypes from "./types/line/line_types.js";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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

async function readRememberedToken(path: string): Promise<string | undefined> {
	try {
		if (!existsSync(path)) return undefined;
		const token = (await readFile(path, "utf8")).trim();
		return token || undefined;
	} catch {
		return undefined;
	}
}

async function writeRememberedToken(path: string, token: string): Promise<void> {
	const directory = dirname(path);
	if (directory !== ".") {
		await mkdir(directory, { recursive: true });
	}
	await writeFile(path, token.trim(), "utf8");
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
}

export type ClientEvents = {
	message: (message: TalkMessage) => void;
	event: (event: LINETypes.Operation) => void;
	"square:message": (message: SquareMessage) => void;
	"square:event": (event: LINETypes.SquareEvent) => void;
	log: (data: { type: string; data: any }) => void;
};

export interface ListenOptions {
	talk?: boolean;
	square?: boolean;
	signal?: AbortSignal;
}

export interface MessageSender {
	mid: string;
	userfrom: string;
	displayName: string;
	contact?: LINETypes.Contact;
	oa: MessageSenderOA;
}

export interface MessageSenderOA {
	isSpecial: boolean;
	contentType: LINETypes.ContentType;
	contentMetadata: Record<string, string>;
	altText: string;
	displayText: string;
	flexJson?: unknown;
}

function parseFlexJson(contentMetadata: Record<string, string>): unknown | undefined {
	const json = contentMetadata.FLEX_JSON;
	if (!json) return undefined;
	try {
		return JSON.parse(json);
	} catch {
		return undefined;
	}
}

function buildSenderOA(raw: LINETypes.Message): MessageSenderOA {
	const contentMetadata = raw.contentMetadata ?? {};
	const altText = contentMetadata.ALT_TEXT ?? "";
	const displayText = raw.text || altText || raw.contentPreview || "";
	const flexJson = parseFlexJson(contentMetadata);
	const isSpecial = raw.contentType === "FLEX" || Boolean(altText) || Boolean(flexJson);

	return {
		isSpecial,
		contentType: raw.contentType,
		contentMetadata,
		altText,
		displayText,
		flexJson,
	};
}

// ====== Message Wrapper ======

export class TalkMessage {
	readonly raw: LINETypes.Message;
	readonly client: LineClient;
	readonly sender: MessageSender;
	private _flexJson?: any;
	private _flexJsonLoaded = false;

	constructor(opts: { raw: LINETypes.Message; client: LineClient; sender: MessageSender }) {
		this.raw = opts.raw;
		this.client = opts.client;
		this.sender = opts.sender;
	}

	get id(): string { return this.raw.id; }
	get from(): string { return this.raw.from; }
	get to(): string { return this.raw.to; }
	get text(): string { return this.raw.text ?? ""; }
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

	reply(text: string): Promise<LINETypes.Message> {
		return this.client.sendMessage(this.raw.to, text);
	}

	unsend(): Promise<void> {
		return this.client.unsendMessage(this.id);
	}

	read(): Promise<void> {
		return this.client.sendChatChecked(this.raw.to, this.raw.id);
	}
}

// ====== Square Message Wrapper ======

export class SquareMessage {
	readonly raw: any;
	readonly client: LineClient;

	constructor(opts: { raw: any; client: LineClient }) {
		this.raw = opts.raw;
		this.client = opts.client;
	}

	get id(): string { return this.raw.id; }
	get squareChatMid(): string { return this.raw.squareChatMid; }
	get text(): string { return this.raw.text ?? ""; }

	reply(text: string): Promise<any> {
		return this.client.sendSquareMessage(this.squareChatMid, text);
	}
}

// ====== LineClient ======

export class LineClient {
	readonly base: BaseClient;
	private _storage: BaseStorage;
	private _loggedIn: boolean = false;
	private readonly _rememberPath?: string;

	constructor(options: LineClientOptions = {}) {
		const device = options.device || "DESKTOPWIN";
		this._rememberPath = resolveRememberPath(options.rememberMe);
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
				void writeRememberedToken(this._rememberPath!, token).catch(() => {});
			});
		}
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
		if (options?.authToken) {
			await this.base.loginProcess.login({ authToken: options.authToken });
			this._loggedIn = true;
			await this.ensureE2EEKeyPair();
			if (this._rememberPath && this.base.authToken) {
				await writeRememberedToken(this._rememberPath, this.base.authToken);
			}
			return this.base.profile!;
		}

		const rememberPath = resolveRememberPath(options?.rememberMe);
		if (rememberPath) {
			const rememberedToken = await readRememberedToken(rememberPath);
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
			await writeRememberedToken(rememberPath, this.base.authToken);
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
		const rememberPath = resolveRememberPath(options.rememberMe);

		if (options.authToken) {
			await client.base.loginProcess.login({ authToken: options.authToken });
			client._loggedIn = true;
			await client.ensureE2EEKeyPair();
			if (rememberPath && client.base.authToken) {
				await writeRememberedToken(rememberPath, client.base.authToken);
			}
			return client;
		}

		if (rememberPath) {
			const rememberedToken = await readRememberedToken(rememberPath);
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
			await writeRememberedToken(rememberPath, client.base.authToken);
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

	async sendCompactMessage(to: string, text: string): Promise<any> {
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

	async sendImage(to: string, data: Buffer | Blob): Promise<any> {
		this.ensureLoggedIn();
		const blob = data instanceof Blob ? data : new Blob([data as any]);
		return await this.base.obs.uploadMediaByE2EE({ data: blob, oType: "image", to });
	}

	async sendVideo(to: string, data: Buffer | Blob): Promise<any> {
		this.ensureLoggedIn();
		const blob = data instanceof Blob ? data : new Blob([data as any]);
		return await this.base.obs.uploadMediaByE2EE({ data: blob, oType: "video", to });
	}

	async sendAudio(to: string, data: Buffer | Blob): Promise<any> {
		this.ensureLoggedIn();
		const blob = data instanceof Blob ? data : new Blob([data as any]);
		return await this.base.obs.uploadMediaByE2EE({ data: blob, oType: "audio", to });
	}

	async sendFile(to: string, data: Buffer | Blob, filename: string): Promise<any> {
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
	}): Promise<any> {
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

	async getAllChatMids(): Promise<any> {
		this.ensureLoggedIn();
		return await this.base.talk.getAllChatMids(
			{ request: { withMemberChats: true, withInvitedChats: true } },
		);
	}

	// ====== Friends ======

	async getContacts(): Promise<any[]> {
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

	async getSquares(): Promise<any[]> {
		this.ensureLoggedIn();
		const response = await continueRequest({
			handler: (arg) => this.base.square.getJoinedSquares(arg),
			arg: { limit: 100 },
		});
		return response.squares;
	}

	async sendSquareMessage(squareChatMid: string, text: string): Promise<any> {
		this.ensureLoggedIn();
		return await this.base.square.sendMessage({
			squareChatMid,
			text,
		});
	}

	async joinSquare(invitationUrl: string): Promise<any> {
		this.ensureLoggedIn();
		return await this.base.square.joinSquare({ invitationUrl } as any);
	}

	async leaveSquare(squareMid: string): Promise<void> {
		this.ensureLoggedIn();
		await this.base.square.leaveSquare({ request: { squareMid } });
	}

	// ====== Listen ======

	listen(opts: ListenOptions = { talk: true, square: true }): void {
		this.ensureLoggedIn();
		const signal = opts.signal;
		const buildTalkMessage = async (raw: LINETypes.Message): Promise<TalkMessage> => {
			try {
				const sender = await this.getContact(raw.from);
				return new TalkMessage({
					raw,
					client: this,
					sender: {
						mid: sender.mid,
						userfrom: sender.mid,
						displayName: sender.displayName,
						contact: sender,
						oa: buildSenderOA(raw),
					},
				});
			} catch {
				return new TalkMessage({
					raw,
					client: this,
					sender: {
						mid: raw.from,
						userfrom: raw.from,
						displayName: raw.from,
							oa: buildSenderOA(raw),
					},
				});
			}
		};

		signal?.addEventListener("abort", () => {
			this.base.push.opStream.close();
			this.base.push.sqStream.close();
		});

		if (opts.talk) {
			(async () => {
				for await (const event of (this.base.poll as any)._listenTalkEvents({
					signal,
					pollingInterval: 1000,
				})) {
					this.base.emit("event" as any, event);
					if (event.type === "SEND_MESSAGE" || event.type === "RECEIVE_MESSAGE") {
						try {
							const msg = await this.base.e2ee.decryptE2EEMessage(event.message);
							this.base.emit("message" as any, await buildTalkMessage(msg));
						} catch (error) {
							if (error instanceof Error && error.message.includes("E2EE Key has not been saved")) {
								try {
									await this.ensureE2EEKeyPair();
									const msg = await this.base.e2ee.decryptE2EEMessage(event.message);
									this.base.emit("message" as any, await buildTalkMessage(msg));
									continue;
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
					}
				}
			})();
		}

		if (opts.square) {
			(async () => {
				for await (const event of (this.base.poll as any)._listenSquareEvents({
					signal,
					pollingInterval: 1000,
				})) {
					this.base.emit("square:event" as any, event);
					if (event.type === "NOTIFICATION_MESSAGE") {
						this.base.emit(
							"square:message" as any,
							new SquareMessage({
								raw: event.payload.notificationMessage.squareMessage,
								client: this,
							}),
						);
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
