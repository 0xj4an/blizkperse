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
        env: Environment.BETA,
      }}
      config={{ appName: "Blizkperse" }}
      paraModalConfig={{
        disableEmailLogin: false,
        authLayout: ["AUTH:FULL", "EXTERNAL:FULL"],
        oAuthMethods: ["GOOGLE", "TWITTER"],
      }}
    >
      {children}
      <ParaModal />
    </ParaProvider>
  );
}
