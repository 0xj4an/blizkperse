import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAddressEqual, recoverMessageAddress } from "viem";
import {
  AUTH_ADDRESS_HEADER,
  AUTH_SIGNATURE_HEADER,
  AUTH_TIMESTAMP_HEADER,
  buildWalletAuthMessage,
} from "./auth-shared";

const AUTH_TTL_MS = 5 * 60 * 1000;

export async function requireWalletAuth(req: NextRequest) {
  const address = req.headers.get(AUTH_ADDRESS_HEADER);
  const signature = req.headers.get(AUTH_SIGNATURE_HEADER);
  const timestamp = req.headers.get(AUTH_TIMESTAMP_HEADER);

  if (!address || !signature || !timestamp) {
    return {
      error: NextResponse.json(
        { error: "Missing wallet auth headers" },
        { status: 401 },
      ),
    };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > AUTH_TTL_MS) {
    return {
      error: NextResponse.json(
        { error: "Wallet auth signature expired" },
        { status: 401 },
      ),
    };
  }

  try {
    const recovered = await recoverMessageAddress({
      message: buildWalletAuthMessage(address, timestamp),
      signature: signature as `0x${string}`,
    });

    if (!isAddressEqual(recovered, address as `0x${string}`)) {
      return {
        error: NextResponse.json(
          { error: "Invalid wallet signature" },
          { status: 401 },
        ),
      };
    }

    return { address: address.toLowerCase() };
  } catch {
    return {
      error: NextResponse.json(
        { error: "Invalid wallet signature" },
        { status: 401 },
      ),
    };
  }
}
