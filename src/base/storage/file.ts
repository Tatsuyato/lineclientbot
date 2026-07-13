import * as fs from "node:fs";
import { BaseStorage, type Storage } from "./base.js";

export class FileStorage extends BaseStorage {
	private writeLock: Promise<void> = Promise.resolve();

	constructor(
		private path: string,
		extendData?: string,
	) {
		super();
		try {
			fs.readFileSync(this.path, "utf-8");
			if (extendData) {
				fs.writeFileSync(this.path, extendData, "utf-8");
			}
		} catch (_e) {
			fs.writeFileSync(this.path, extendData || "{}", "utf-8");
		}
	}

	private async withLock<T>(fn: () => Promise<T>): Promise<T> {
		let resolve!: () => void;
		const next = new Promise<void>((r) => { resolve = r; });
		const prev = this.writeLock;
		this.writeLock = next;
		await prev;
		try {
			return await fn();
		} finally {
			resolve();
		}
	}

	public async set(key: Storage["Key"], value: Storage["Value"]): Promise<void> {
		await this.withLock(async () => {
			const data = await this.getAll();
			data[key] = value;
			await new Promise<void>((resolve) => {
				fs.writeFile(this.path, JSON.stringify(data), "utf-8", () => resolve());
			});
		});
	}

	public async get(key: Storage["Key"]): Promise<Storage["Value"] | undefined> {
		const data = await this.getAll();
		return data[key];
	}

	public async delete(key: Storage["Key"]): Promise<void> {
		await this.withLock(async () => {
			const data = await this.getAll();
			delete data[key];
			await new Promise<void>((resolve) => {
				fs.writeFile(this.path, JSON.stringify(data), "utf-8", () => resolve());
			});
		});
	}

	public async clear(): Promise<void> {
		await this.withLock(async () => {
			await new Promise<void>((resolve) => {
				fs.writeFile(this.path, "{}", "utf-8", () => resolve());
			});
		});
	}

	public async getAll(): Promise<Record<Storage["Key"], Storage["Value"]>> {
		const file = await new Promise<string>((resolve) => {
			fs.readFile(this.path, "utf-8", (_e, data) => resolve(data || "{}"));
		});
		return JSON.parse(file);
	}

	public async migrate(storage: BaseStorage): Promise<void> {
		const kv = await this.getAll();
		for (const key in kv) {
			if (Object.prototype.hasOwnProperty.call(kv, key)) {
				await storage.set(key, kv[key]);
			}
		}
	}
}
