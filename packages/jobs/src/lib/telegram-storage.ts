/**
 * telegram-storage.ts
 *
 * ER asset storage via Telegram bot.
 *
 * Provides a lightweight, dependency-free mechanism to persist binary files
 * (evidence photos, PDF reports, etc.) to a Telegram channel using the Bot API,
 * and to retrieve them later by file_id.  Uses Node 22 global `fetch`,
 * `FormData`, and `Blob` — no extra npm packages required.
 *
 * Telegram bot getFile download is capped at 20 MB, which is well within the
 * expected size of ER photos and short-form reports.
 *
 * Environment variable required:
 *   TELEGRAM_BOT_TOKEN — the HTTP API token issued by @BotFather.
 *
 * Typical usage:
 *   const token = getTelegramBotToken();
 *   const { messageId, fileId } = await uploadDocumentToTelegram({
 *     botToken: token,
 *     chatId: process.env.TELEGRAM_STORAGE_CHAT_ID ?? "",
 *     bytes: pdfBytes,
 *     filename: "coverage-report.pdf",
 *     mimeType: "application/pdf",
 *     caption: "Coverage Report 2024-06",
 *   });
 *   // Later …
 *   const { bytes } = await fetchTelegramFileBytes({ botToken: token, fileId });
 */

// ---------------------------------------------------------------------------
// Telegram API response shapes
// ---------------------------------------------------------------------------

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramMessage {
  message_id: number;
  document?: TelegramDocument;
  photo?: TelegramPhotoSize[];
}

interface TelegramSendDocumentResponse {
  ok: boolean;
  description?: string;
  result?: TelegramMessage;
}

interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

interface TelegramGetFileResponse {
  ok: boolean;
  description?: string;
  result?: TelegramFile;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TelegramUploadResult {
  messageId: number;
  fileId: string;
}

// ---------------------------------------------------------------------------
// uploadDocumentToTelegram
// ---------------------------------------------------------------------------

/**
 * Upload raw bytes to a Telegram channel as a document and return the
 * Telegram message ID and file_id that can be used to retrieve it later.
 *
 * The `document` field is preferred; if the Bot API returns a `photo` array
 * instead (e.g. for JPEG files below ~10 MB), the largest photo size is used.
 */
export async function uploadDocumentToTelegram(params: {
  botToken: string;
  chatId: string;
  bytes: Uint8Array<ArrayBuffer>;
  filename: string;
  mimeType?: string;
  caption?: string;
}): Promise<TelegramUploadResult> {
  const {
    botToken,
    chatId,
    bytes,
    filename,
    mimeType = "application/octet-stream",
    caption,
  } = params;

  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption !== undefined && caption !== "") {
    form.append("caption", caption);
  }
  // Do NOT set Content-Type manually — fetch sets the multipart boundary automatically.
  form.append("document", new Blob([bytes], { type: mimeType }), filename);

  const url = `https://api.telegram.org/bot${botToken}/sendDocument`;
  const res = await fetch(url, { method: "POST", body: form });

  const json = (await res.json()) as TelegramSendDocumentResponse;

  if (!json.ok || json.result === undefined) {
    throw new Error(
      `Telegram sendDocument failed: ${json.description ?? "unknown error"}`,
    );
  }

  const messageId = json.result.message_id;
  const fileId =
    json.result.document?.file_id ??
    json.result.photo?.at(-1)?.file_id ??
    "";

  return { messageId, fileId };
}

// ---------------------------------------------------------------------------
// fetchTelegramFileBytes
// ---------------------------------------------------------------------------

/**
 * Retrieve a previously uploaded file's raw bytes from Telegram.
 *
 * NOTE: Telegram bot getFile download is capped at 20 MB — fine for ER photos
 * and standard report PDFs. Files larger than 20 MB must use an alternative
 * storage strategy (e.g. MinIO presigned URL stored in the Telegram caption).
 */
export async function fetchTelegramFileBytes(params: {
  botToken: string;
  fileId: string;
}): Promise<{ bytes: ArrayBuffer; filePath: string }> {
  const { botToken, fileId } = params;

  // Step 1 — resolve the temporary download path.
  const metaUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const metaRes = await fetch(metaUrl);
  const meta = (await metaRes.json()) as TelegramGetFileResponse;

  if (!meta.ok || meta.result === undefined) {
    throw new Error(
      `Telegram getFile failed: ${meta.description ?? "unknown error"}`,
    );
  }

  const filePath = meta.result.file_path;
  if (filePath === undefined || filePath === "") {
    throw new Error(
      `Telegram getFile returned no file_path for file_id "${fileId}"`,
    );
  }

  // Step 2 — download the file bytes.
  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  const downloadRes = await fetch(downloadUrl);

  if (!downloadRes.ok) {
    throw new Error(
      `Telegram file download failed: HTTP ${downloadRes.status} ${downloadRes.statusText}`,
    );
  }

  const bytes = await downloadRes.arrayBuffer();
  return { bytes, filePath };
}

// ---------------------------------------------------------------------------
// getTelegramBotToken
// ---------------------------------------------------------------------------

/**
 * Read TELEGRAM_BOT_TOKEN from the process environment.
 * Throws a descriptive error if the variable is absent or empty so callers
 * receive an actionable message rather than a mysterious API 401.
 */
export function getTelegramBotToken(): string {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (token === undefined || token.trim() === "") {
    throw new Error(
      "TELEGRAM_BOT_TOKEN environment variable is not set. " +
        "Add it to your .env.dev / .env.staging / .env.prod file.",
    );
  }
  return token.trim();
}
