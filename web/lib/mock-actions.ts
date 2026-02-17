import type { Payout, Payment, Registration } from "./mock-data";

function delay(ms = 1500) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockTxHash() {
  const hex = Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `0x${hex}`;
}

export async function createPayout(params: {
  payerId: string;
  participants: { participantId: string; amount: number }[];
}): Promise<Payout> {
  await delay();
  const totalAmount = params.participants.reduce((s, p) => s + p.amount, 0);
  return {
    id: `payout-${Date.now()}`,
    payerId: params.payerId,
    participants: params.participants,
    totalAmount,
    status: "deposited",
    createdAt: new Date().toISOString(),
    txHash: mockTxHash(),
  };
}

export async function claimPayment(
  paymentId: string
): Promise<{ txHash: string; payment: Payment }> {
  await delay();
  const txHash = mockTxHash();
  return {
    txHash,
    payment: {
      id: paymentId,
      payoutId: "payout-mock",
      payerId: "payer-mock",
      participantId: "part-mock",
      amount: 0,
      status: "claimed",
      claimedAt: new Date().toISOString(),
      txHash,
    },
  };
}

export async function registerWithPayer(
  payerId: string,
  participantId: string
): Promise<Registration> {
  await delay();
  return {
    id: `reg-${Date.now()}`,
    payerId,
    participantId,
    status: "active",
    registeredAt: new Date().toISOString(),
  };
}
