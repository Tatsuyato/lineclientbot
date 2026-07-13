export interface Storage {
	Key: string;
	Value: string | number | boolean | null | Record<string | number, any>;
}

export abstract class BaseStorage {
	public abstract set(key: Storage["Key"], value: Storage["Value"]): Promise<void>;
	public abstract get(key: Storage["Key"]): Promise<Storage["Value"] | undefined>;
	public abstract delete(key: Storage["Key"]): Promise<void>;
	public abstract clear(): Promise<void>;
	public abstract migrate(storage: BaseStorage): Promise<void>;
}
