import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=()",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self' https:",
      "frame-src https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Prevent webpack from bundling native Node.js modules (bcrypt uses node-pre-gyp)
  serverExternalPackages: ["bcrypt"],
  transpilePackages: [
    "@marine-guardian/shared",
    "@marine-guardian/db",
    "@marine-guardian/ui",
    "@marine-guardian/jobs",
  ],
  webpack(config, { isServer }: { isServer: boolean }) {
    if (isServer) {
      // Rewrite `node:X` URI scheme imports as plain `require('X')` so webpack
      // doesn't hit UnhandledSchemeError when bundling server code.
      const prev = config.externals;
      const nodeSchemeExternal = (
        { request }: { request?: string },
        callback: (err?: Error | null, result?: string) => void,
      ) => {
        if (request?.startsWith("node:")) {
          return callback(null, `commonjs ${request.slice(5)}`);
        }
        callback();
      };
      config.externals = [
        nodeSchemeExternal,
        ...(Array.isArray(prev) ? prev : prev ? [prev] : []),
      ];
    }
    return config;
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
