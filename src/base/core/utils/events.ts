import type * as LINETypes from "../../../types/line/line_types.js";
import type { SyncData } from "../../polling/mod.js";
type LooseType = any;
// import type { Operation, SquareMessage, TalkMessage } from "../../event/mod.js";
// deno-lint-ignore ban-types
type LogType = "login" | "request" | "response" | (string & {});

export interface Log {
	type: LogType;
	data: LooseType;
}

export type ClientEvents = {
	pincall: (pincode: string) => void;
	qrcall: (loginUrl: string) => void;
	ready: (user: LINETypes.Profile) => void;
	end: (user: LINETypes.Profile) => void;
	"update:authtoken": (authToken: string) => void;
	"update:profile": (profile: LINETypes.Profile) => void;
	"update:cert": (cert: string) => void;
	"update:qrcert": (qrCert: string) => void;
	"update:syncdata": (sync: SyncData) => void;
	log: (data: Log) => void;
};
