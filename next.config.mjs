/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfkit/fontkit read .afm font metrics from disk relative to their own
  // module location at runtime — bundling them breaks that path resolution,
  // so they must run as plain CommonJS requires from node_modules instead.
  serverExternalPackages: ["pdfkit", "fontkit"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        // A2MCP is called by other agents/services, not browsers — keep it open for cross-origin agent calls,
        // auth happens via x402 payment header + API key, not CORS.
        source: "/api/a2mcp/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, X-PAYMENT, X-Agent-Id, X-Api-Key" },
        ],
      },
    ];
  },
};

export default nextConfig;
