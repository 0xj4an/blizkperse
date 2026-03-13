"use client";

import { ParaProvider, ParaModal, Environment } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";
import { http } from "viem";
import { CHAINS, CHAIN_IDS } from "@/lib/constants";
import { buildViemChain } from "@/lib/contracts";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

const viemChains = CHAIN_IDS.map((id) => buildViemChain(CHAINS[id]!));
const chains = [viemChains[0]!, ...viemChains.slice(1)] as const;
const transports = Object.fromEntries(
  CHAIN_IDS.map((id) => [id, http(CHAINS[id]!.rpcUrl)]),
) as Record<(typeof CHAIN_IDS)[number], ReturnType<typeof http>>;

export function ParaWrapper({
  apiKey,
  children,
}: {
  apiKey: string;
  children: React.ReactNode;
}) {
  return (
    <ParaProvider
      paraClientConfig={{
        apiKey,
        env: Environment.PROD,
      }}
      config={{ appName: "Blizkperse" }}
      externalWalletConfig={{
        appDescription: "Privacy-preserving payments on Celo & Monad",
        appUrl: "https://app.blizkperse.com",
        appIcon: "https://app.blizkperse.com/logo.svg",
        wallets: [
          "METAMASK",
          "WALLETCONNECT",
          "ZERION",
          "PHANTOM",
          "RABBY",
          "COINBASE",
        ],
        walletConnect: walletConnectProjectId
          ? { projectId: walletConnectProjectId }
          : undefined,
        evmConnector: {
          config: {
            chains,
            transports,
          },
        },
      }}
      paraModalConfig={{
        disableEmailLogin: false,
        disablePhoneLogin: false,
        authLayout: ["AUTH:FULL", "EXTERNAL:FULL"],
        oAuthMethods: ["GOOGLE", "APPLE", "FACEBOOK", "TWITTER", "TELEGRAM"],
        twoFactorAuthEnabled: true,
        recoverySecretStepEnabled: true,
        onRampTestMode: true,
        logo: "https://app.blizkperse.com/logo.svg",
        theme: {
          mode: "dark",
          foregroundColor: "#FFFFFF",
          backgroundColor: "#0D0B14",
          accentColor: "#7C3AED",
          darkForegroundColor: "#FFFFFF",
          darkBackgroundColor: "#0D0B14",
          darkAccentColor: "#7C3AED",
          borderRadius: "md",
          font: "Inter",
        },
      }}
    >
      {children}
      <ParaModal />
    </ParaProvider>
  );
}
