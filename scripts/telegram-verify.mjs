#!/usr/bin/env node
/**
 * telegram-verify.mjs — one-time Telegram bot + channel setup verifier.
 *
 * Confirms a BotFather bot token works, resolves the target channel's numeric
 * chat_id, and posts a test message/photo to prove the bot can write to the
 * channel. Output is the chat_id you store in Server-Setups alongside the token.
 *
 * Dependency-free (Node 18+ global fetch). Run standalone:
 *
 *   node scripts/telegram-verify.mjs --token <BOT_TOKEN>
 *   node scripts/telegram-verify.mjs --token <BOT_TOKEN> --chat @your_channel
 *   node scripts/telegram-verify.mjs --token <BOT_TOKEN> --chat -1001234567890 --send-photo
 *
 * No --chat → reads getUpdates and lists channels the bot has seen
 *   (post any message in the channel first so a channel_post update exists).
 * With --chat → resolves the channel and sends a test message
 *   (add --send-photo to also send a tiny test image).
 *
 * Nothing is written to disk or committed. The token is only sent to
 * api.telegram.org. Store the token + resolved chat_id in
 * Server-Setups/Powerbyte-Hostinger/secrets/marine-guardian-telegram.enc.yaml.
 */

const args = process.argv.slice(2);
function arg(flag, fallback = undefined) {
  const i = args.indexOf(flag);
  if (i !== -1 && args[i + 1] !== undefined && !args[i + 1].startsWith("--")) return args[i + 1];
  if (i !== -1) return true; // bare flag
  return fallback;
}

const token = arg("--token", process.env.TELEGRAM_BOT_TOKEN);
const chat = arg("--chat");
const sendPhoto = args.includes("--send-photo");

if (!token || typeof token !== "string") {
  console.error("ERROR: provide --token <BOT_TOKEN> (or set TELEGRAM_BOT_TOKEN).");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${token}`;

async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method} failed: ${json.error_code} ${json.description}`);
  return json.result;
}

async function main() {
  // 1. Verify the bot token.
  const me = await tg("getMe");
  console.log(`✅ Bot OK: @${me.username} (id ${me.id}, name "${me.first_name}")`);

  // 2. Resolve / list channels.
  if (!chat) {
    console.log("\nNo --chat given. Reading recent updates to find your channel…");
    console.log("(If nothing shows: add the bot as channel ADMIN, then post any");
    console.log(" message in the channel, then re-run this command.)\n");
    const updates = await tg("getUpdates");
    const seen = new Map();
    for (const u of updates) {
      const c = u.channel_post?.chat || u.my_chat_member?.chat || u.message?.chat;
      if (c && (c.type === "channel" || c.type === "supergroup")) seen.set(c.id, c.title || c.username || c.id);
    }
    if (seen.size === 0) {
      console.log("No channels found in recent updates yet.");
      console.log("→ Make sure the bot is a channel admin AND a message was posted after that.");
    } else {
      console.log("Channels the bot can see:");
      for (const [id, title] of seen) console.log(`   chat_id=${id}   "${title}"`);
      console.log("\nRe-run with:  --chat <that chat_id>  --send-photo   to confirm posting.");
    }
    return;
  }

  // 3. Resolve the given chat + confirm membership.
  const ch = await tg("getChat", { chat_id: chat });
  console.log(`✅ Channel resolved: chat_id=${ch.id}  type=${ch.type}  title="${ch.title ?? ch.username ?? ch.id}"`);

  // 4. Send a test message (proves write permission).
  const msg = await tg("sendMessage", {
    chat_id: ch.id,
    text: "✅ Marine Guardian — Telegram asset channel connected. (setup test)",
  });
  console.log(`✅ Test message posted (message_id ${msg.message_id}).`);

  if (sendPhoto) {
    const photo = await tg("sendPhoto", {
      chat_id: ch.id,
      photo: "https://placehold.co/600x400/0b3d2e/ffffff/png?text=Marine+Guardian+ER+Assets",
      caption: "Marine Guardian — test asset upload OK",
    });
    console.log(`✅ Test photo posted (message_id ${photo.message_id}).`);
  }

  console.log("\n──────────────── STORE THESE IN SERVER-SETUPS ────────────────");
  console.log(`telegram_bot_token:     <the token you passed>`);
  console.log(`telegram_bot_username:  ${me.username}`);
  console.log(`telegram_chat_id:       ${ch.id}`);
  console.log(`telegram_channel_title: ${ch.title ?? ch.username ?? ch.id}`);
  console.log("──────────────────────────────────────────────────────────────");
}

main().catch((e) => {
  console.error("✗ " + e.message);
  process.exit(1);
});
