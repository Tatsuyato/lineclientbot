import { LineClient } from "lineclientbot";

/**
 * Send Media & Files Example
 * Demonstrates:
 * - Smart polymorphic send: client.send(target, { image: "./photo.png" })
 * - Direct local file paths without manual Buffer reading
 * - Sending stickers and locations
 * - Sending to User or Chat objects directly
 */

async function main() {
	const token = process.env.LINE_TOKEN || "YOUR_AUTH_TOKEN";
	const targetChatMid = process.env.TARGET_CHAT || "u1234567890abcdef1234567890abcdef";

	const client = new LineClient();
	await client.login(token);

	// 1. Send plain text
	await client.send(targetChatMid, "Hello from lineclientbot v1.0!");

	// 2. Send image using local file path directly
	// Automatically reads file and infers name
	await client.send(targetChatMid, {
		image: "./photo.png",
	});

	// 3. Send file / document
	await client.send(targetChatMid, {
		file: "./report.pdf",
		filename: "Monthly-Report.pdf",
	});

	// 4. Send sticker
	await client.send(targetChatMid, {
		sticker: {
			stickerId: "52002734",
			packageId: "11537",
		},
	});

	// 5. Send location
	await client.send(targetChatMid, {
		location: {
			title: "Bangkok Central",
			address: "Pathum Wan, Bangkok 10330",
			latitude: 13.7466,
			longitude: 100.5347,
		},
	});

	console.log("All media messages sent successfully!");
	await client.close();
}

main().catch(console.error);
