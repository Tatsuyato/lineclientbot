import { LineClient } from "lineclientbot";

/**
 * QR Code Login Example
 * Demonstrates:
 * - Interactive QR login via terminal
 * - Auto-saving session with rememberMe
 * - PIN callback handling
 */

async function main() {
	console.log("Starting QR login...");

	const client = await LineClient.loginWithQR({
		device: "DESKTOPWIN",
		rememberMe: "./session-token.txt",
		onQR: (url) => {
			console.log("\nScan this URL on your LINE mobile app:");
			console.log(url);
			console.log("");
		},
		onPin: (pin) => {
			console.log(`\nInput this PIN on your phone: ${pin}\n`);
		},
	});

	console.log(`Successfully logged in as: ${client.profile?.displayName}`);
	console.log(`MID: ${client.profile?.mid}`);
	console.log(`Auth Token: ${client.authToken?.slice(0, 10)}... (saved to session-token.txt)`);

	await client.close();
}

main().catch(console.error);
