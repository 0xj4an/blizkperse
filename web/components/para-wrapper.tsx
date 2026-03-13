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
          "PHANTOM",
          "RABBY",
          "COINBASE",
        ],
        walletConnect: walletConnectProjectId
          ? { projectId: walletConnectProjectId }
          : undefined,
      }}
      paraModalConfig={{
        logo: "https://app.blizkperse.com/logo.svg",
        theme: {
          foregroundColor: "#FFFFFF",
          backgroundColor: "#0D0B14",
          accentColor: "#7C3AED",
          font: "Inter",
          borderRadius: "md",
        },
        oAuthMethods: ["GOOGLE", "APPLE", "FACEBOOK", "TWITTER", "TELEGRAM"],
        authLayout: ["AUTH:FULL", "EXTERNAL:FULL"],
        twoFactorAuthEnabled: true,
        recoverySecretStepEnabled: true,
        onRampTestMode: true,
      }}
    >
      {children}
      <ParaModal />
    </ParaProvider>
  );
}
