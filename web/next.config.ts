import type { NextConfig } from "next";
import path from "path";

const poseidon2Vendor = path.join(
  __dirname,
  "lib/vendor/poseidon-lite/poseidon2.js"
);

const nextConfig: NextConfig = {
  reactStrictMode: false,
  output: "standalone",
  transpilePackages: ["@getpara/react-sdk"],
  typescript: { ignoreBuildErrors: true },

  // Include WASM files that Next.js file tracing misses (dynamically loaded by bb.js)
  outputFileTracingIncludes: {
    "/api/generate-proof": [
      "./node_modules/@aztec/bb.js/**/*",
      "./node_modules/@noir-lang/noir_js/**/*",
    ],
  },

  // WASM support for Noir/Barretenberg proof generation
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        worker_threads: false,
      };
    }
    // Suppress optional peer deps (Para / wagmi / Coinbase CDP pull these; app does not use them)
    // Alias poseidon-lite → in-repo vendor so client never loads a separate npm async chunk.
    config.resolve.alias = {
      ...config.resolve.alias,
      "poseidon-lite/poseidon2": poseidon2Vendor,
      "poseidon-lite": poseidon2Vendor,
      "@farcaster/miniapp-sdk": false,
      "@farcaster/miniapp-wagmi-connector": false,
      "@farcaster/mini-app-solana": false,
      // Tempo Accounts SDK — optional peer of @wagmi/core
      accounts: false,
      // x402 payment protocol — optional peers of @coinbase/cdp-sdk
      "@x402/core": false,
      "@x402/core/client": false,
      "@x402/evm": false,
      "@x402/evm/exact/client": false,
      "@x402/evm/upto/client": false,
      "@x402/extensions": false,
      "@x402/svm": false,
    };
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    // Exclude heavy WASM packages from server bundle
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("@aztec/bb.js", "@noir-lang/noir_js");
      }
    }
    return config;
  },

  // NOTE: COOP/COEP headers removed - they break Para SDK auth (iframes/popups).
  // bb.js proof generation works in single-threaded mode without SharedArrayBuffer.
};

export default nextConfig;
