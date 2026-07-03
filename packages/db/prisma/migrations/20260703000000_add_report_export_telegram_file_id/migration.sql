-- Report exports move to Telegram-primary storage (reusing the ER photo
-- archive channel). telegram_file_id holds the Bot API file_id returned by
-- sendDocument; file_path remains for the optional MinIO fallback + legacy rows.
ALTER TABLE "report_exports" ADD COLUMN "telegram_file_id" TEXT;
