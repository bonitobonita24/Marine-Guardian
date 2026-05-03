import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  const locale = "en";
  const messages = (await import(`../../../messages/${locale}.json`)) as { default: Record<string, Record<string, string>> };
  return {
    locale,
    messages: messages.default,
  };
});
