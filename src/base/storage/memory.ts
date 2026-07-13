import { BaseStorage, type Storage } from "./base.js";

export class MemoryStorage extends BaseStorage {
	private data: Map<Storage["Key"], Storage["Value"]> = new Map();

	constructor(extendData?: Record<Storage["Key"], Storage["Value"]>) {
		super();
		if (extendData) {
			this.data = new Map(Object.entries(extendData));
		}
	}

	public async set(key: Storage["Key"], value: Storage["Value"]): Promise<void> {
		this.data.set(key, value);
	}

	public async get(key: Storage["Key"]): Promise<Storage["Value"] | undefined> {
		return this.data.get(key);
	}

	public async delete(key: Storage["Key"]): Promise<void> {
		this.data.delete(key);
	}

	public async clear(): Promise<void> {
		this.data.clear();
	}

	public getAll(): Record<Storage["Key"], Storage["Value"]> {
		return Object.fromEntries(this.data);
	}

	public async migrate(storage: BaseStorage): Promise<void> {
		const kv = this.getAll();
		for (const key in kv) {
			if (Object.prototype.hasOwnProperty.call(kv, key)) {
				await storage.set(key, kv[key]);
			}
		}
	}
}
