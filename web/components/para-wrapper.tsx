"use client";

import { ParaProvider, ParaModal, Environment } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";

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
      paraModalConfig={{
        disableEmailLogin: false,
        authLayout: ["AUTH:FULL", "EXTERNAL:FULL"],
        oAuthMethods: ["GOOGLE", "TWITTER"],
        logo: "/logo.svg",
        theme: {
          mode: "dark",
          backgroundColor: "#0D0B14",
          foregroundColor: "#FFFFFF",
          accentColor: "#7C3AED",
          darkBackgroundColor: "#0D0B14",
          darkForegroundColor: "#FFFFFF",
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
