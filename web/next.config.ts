import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@getpara/react-sdk"],
  typescript: { ignoreBuildErrors: true },

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
    // Suppress Farcaster warnings (optional peer deps of Para SDK, not a miniapp)
    config.resolve.alias = {
      ...config.resolve.alias,
      "@farcaster/miniapp-sdk": false,
      "@farcaster/miniapp-wagmi-connector": false,
      "@farcaster/mini-app-solana": false,
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
