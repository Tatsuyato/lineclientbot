import { LineClient } from "lineclientbot";

/**
 * Echo Bot Example
 * Demonstrates:
 * - Direct token login
 * - Receiving messages & typed properties
 * - Direct reply with msg.reply()
 * - Reaction with msg.react()
 * - Mark as read with msg.read()
 * - Graceful shutdown with client.destroy()
 */

async function main() {
	const token = process.env.LINE_TOKEN || "YOUR_AUTH_TOKEN";
	const client = new LineClient();

	client.on("ready", (profile) => {
		console.log(`Bot logged in as: ${profile.displayName} (${profile.mid})`);
	});

	client.on("message", async (msg) => {
		console.log(`[${msg.channel.id}] ${msg.author.displayName || msg.author.id}: ${msg.text}`);

		// Ignore empty messages
		if (!msg.text) return;

		// Mark message as read
		await msg.read();

		// Add reaction
		await msg.react("LOVE");

		// Echo reply
		if (msg.text.startsWith("!ping")) {
			await msg.reply("pong! 🏓");
		} else {
			await msg.reply(`Echo: ${msg.text}`);
		}
	});

	client.on("error", (err) => {
		console.error("Client error:", err);
	});

	client.on("close", () => {
		console.log("LINE client connection closed.");
	});

	await client.login(token);

	// Start listening for Talk and Square events
	client.listen({ talk: true, square: false });
	console.log("Bot is listening for messages. Press Ctrl+C to exit.");

	// Graceful shutdown
	const shutdown = async () => {
		console.log("\nShutting down...");
		await client.destroy();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

main().catch(console.error);
