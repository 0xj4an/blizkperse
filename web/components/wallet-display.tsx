"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Check, Copy } from "lucide-react";

export function WalletDisplay({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Badge
      variant="secondary"
      className="cursor-pointer gap-1.5 font-mono text-xs transition-colors hover:bg-secondary/80"
      onClick={handleCopy}
    >
      {truncated}
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </Badge>
  );
}
