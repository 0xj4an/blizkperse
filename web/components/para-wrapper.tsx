"use client";

import { ParaProvider, ParaModal, Environment } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";

const IS_PROD = process.env.NEXT_PUBLIC_BLIZ_ENV === "production";
const paraEnv = IS_PROD ? Environment.PROD : Environment.BETA;

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

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
        env: paraEnv,
      }}
      config={{ appName: "Blizkperse" }}
      externalWalletConfig={{
        wallets: [
          "METAMASK",
          "WALLETCONNECT",
          "ZERION",
          "COINBASE",
          "RABBY",
        ],
        walletConnect: walletConnectProjectId
          ? { projectId: walletConnectProjectId }
          : undefined,
      }}
      paraModalConfig={{
        logo:
          typeof window !== "undefined"
            ? `${window.location.origin}/logo.svg`
            : "/logo.svg",
        theme: {
          mode: "dark",
          foregroundColor: "#FFFFFF",
          backgroundColor: "#0D0B14",
          accentColor: "#7C3AED",
          darkForegroundColor: "#FFFFFF",
          darkBackgroundColor: "#0D0B14",
          darkAccentColor: "#7C3AED",
          font: "Inter",
          borderRadius: "md",
        },
        oAuthMethods: ["GOOGLE", "APPLE", "FACEBOOK", "TWITTER", "TELEGRAM"],
        authLayout: ["AUTH:FULL", "EXTERNAL:FULL"],
        twoFactorAuthEnabled: true,
        recoverySecretStepEnabled: true,
        onRampTestMode: true,
        isGuestModeEnabled: true,
      }}
    >
      {children}
      <ParaModal />
    </ParaProvider>
  );
}
