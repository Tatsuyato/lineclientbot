import { LineClient } from "lineclientbot";

/**
 * Flex Message Example
 * Demonstrates:
 * - Sending interactive Flex Message bubbles
 * - Specifying altText
 * - Polymorphic sending
 */

async function main() {
	const token = process.env.LINE_TOKEN || "YOUR_AUTH_TOKEN";
	const targetChatMid = process.env.TARGET_CHAT || "u1234567890abcdef1234567890abcdef";

	const client = new LineClient();
	await client.login(token);

	const receiptFlex = {
		type: "bubble",
		header: {
			type: "box",
			layout: "vertical",
			contents: [
				{
					type: "text",
					text: "RECEIPT #9824",
					weight: "bold",
					color: "#1DB446",
					size: "sm",
				},
				{
					type: "text",
					text: "฿ 490.00",
					weight: "bold",
					size: "xxl",
					margin: "md",
				},
			],
		},
		body: {
			type: "box",
			layout: "vertical",
			contents: [
				{
					type: "text",
					text: "Discord Nitro 1 Month",
					size: "md",
					weight: "bold",
				},
				{
					type: "text",
					text: "Instant Delivery • STELLAR Premium",
					size: "xs",
					color: "#aaaaaa",
					margin: "xs",
				},
			],
		},
	};

	await client.send(targetChatMid, {
		flex: receiptFlex,
		altText: "Your Purchase Receipt (฿490.00)",
	});

	console.log("Flex message sent successfully!");
	await client.close();
}

main().catch(console.error);
