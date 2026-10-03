import type { NextConfig } from "next";

// Sent with every page and API response. A full script CSP needs per-request nonces with
// Next.js, so for now the policy only forbids framing (clickjacking of the knot's buttons).
// The generated-page preview is a sandboxed srcdoc iframe inside our own page, which
// frame-ancestors and X-Frame-Options do not block.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
