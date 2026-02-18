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

  // COOP/COEP for WASM support — use "same-origin-allow-popups" so
  // Para SDK auth popups can communicate back to the parent window.
  // Full cross-origin isolation (SharedArrayBuffer) requires "same-origin",
  // but that blocks Para login. bb.js can fall back to single-threaded WASM.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
