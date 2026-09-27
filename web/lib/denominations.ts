/**
 * Private-buckets denomination tables + exact packer.
 * Must stay aligned with:
 * - zk/circuits/src/withdraw_denom.nr (stables ladder + id 10 = 10)
 * - ShieldedPool.setDenominations / depositBatch
 * - zk/docs/private-amounts-and-batch-deposit.md
 */

export const MAX_NOTES_PER_RECIPIENT = 20;
export const MAX_NOTES_PER_BATCH = 64;

export type Denomination = {
  /** On-chain / circuit denomination_id (index into setDenominations). */
  id: number;
  /** Human token units for UI (string when fractional, e.g. "0.1"). */
  human: number | string;
  /** amount * 10^decimals */
  raw: bigint;
};

export type DenominationLadder = {
  kind: "stables" | "native" | "copm";
  decimals: number;
  /** Dense by id (gaps not used; ids may be non-monotonic by size). */
  byId: Denomination[];
  /** Largest → smallest by raw (for greedy pack). */
  descending: Denomination[];
};

export type PackedNote = {
  denominationId: number;
  human: number | string;
  raw: bigint;
};

export type PackOk = {
  ok: true;
  notes: PackedNote[];
  totalRaw: bigint;
  remainderRaw: 0n;
};

export type PackFail = {
  ok: false;
  notes: PackedNote[];
  totalRaw: bigint;
  remainderRaw: bigint;
  reason: "inexact" | "too_many_notes" | "amount_zero" | "empty_ladder";
};

export type PackResult = PackOk | PackFail;

export type PayableSuggestion = {
  /** Greedy pack of the requested amount (may be inexact). */
  attempted: PackResult;
  /** Largest exact pack with total ≤ requested (drop remainder). */
  floor: PackOk | null;
  /** Smallest exact pack with total ≥ requested, if found. */
  ceil: PackOk | null;
};

/** Stables human units (6-dec circuit table). id 10 = 10. */
const STABLES_HUMAN: ReadonlyArray<{ id: number; human: number }> = [
  { id: 0, human: 50 },
  { id: 1, human: 100 },
  { id: 2, human: 250 },
  { id: 3, human: 500 },
  { id: 4, human: 1_000 },
  { id: 5, human: 2_500 },
  { id: 6, human: 5_000 },
  { id: 7, human: 10_000 },
  { id: 8, human: 25_000 },
  { id: 9, human: 50_000 },
  { id: 10, human: 10 },
];

/** CELO / WMON / WETH human units. id 10 = 10. */
const NATIVE_HUMAN: ReadonlyArray<{ id: number; human: number | string }> = [
  { id: 0, human: "0.1" },
  { id: 1, human: "0.5" },
  { id: 2, human: 1 },
  { id: 3, human: 5 },
  { id: 4, human: 25 },
  { id: 5, human: 50 },
  { id: 6, human: 100 },
  { id: 7, human: 250 },
  { id: 8, human: 500 },
  { id: 9, human: 1_000 },
  { id: 10, human: 10 },
];

/** COPm — thousands only; no bucket of 10. */
const COPM_HUMAN: ReadonlyArray<{ id: number; human: number }> = [
  { id: 0, human: 10_000 },
  { id: 1, human: 25_000 },
  { id: 2, human: 50_000 },
  { id: 3, human: 100_000 },
  { id: 4, human: 250_000 },
  { id: 5, human: 500_000 },
  { id: 6, human: 1_000_000 },
  { id: 7, human: 2_500_000 },
  { id: 8, human: 5_000_000 },
  { id: 9, human: 10_000_000 },
];

function pow10(decimals: number): bigint {
  let x = 1n;
  for (let i = 0; i < decimals; i++) x *= 10n;
  return x;
}

/** Parse human amount to raw with exact decimal scale (no float). */
export function humanToRaw(human: number | string, decimals: number): bigint {
  const s = typeof human === "number" ? String(human) : human.trim();
  if (!s || s === ".") throw new Error(`invalid human amount: ${human}`);
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const [wholePart, fracPart = ""] = body.split(".");
  if (fracPart.length > decimals) {
    throw new Error(`too many fractional digits for ${decimals} decimals: ${human}`);
  }
  const whole = BigInt(wholePart || "0");
  const fracPadded = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  const frac = fracPadded.length ? BigInt(fracPadded) : 0n;
  const raw = whole * pow10(decimals) + frac;
  return neg ? -raw : raw;
}

function buildLadder(
  kind: DenominationLadder["kind"],
  decimals: number,
  rows: ReadonlyArray<{ id: number; human: number | string }>
): DenominationLadder {
  const maxId = rows.reduce((m, r) => Math.max(m, r.id), 0);
  const byId: Denomination[] = new Array(maxId + 1);
  for (const row of rows) {
    byId[row.id] = {
      id: row.id,
      human: row.human,
      raw: humanToRaw(row.human, decimals),
    };
  }
  const descending = rows
    .map((r) => byId[r.id])
    .filter(Boolean)
    .sort((a, b) => (a.raw === b.raw ? b.id - a.id : a.raw > b.raw ? -1 : 1));
  return { kind, decimals, byId, descending };
}

function stablesLadder(decimals = 6): DenominationLadder {
  return buildLadder("stables", decimals, STABLES_HUMAN);
}

function nativeLadder(decimals = 18): DenominationLadder {
  return buildLadder("native", decimals, NATIVE_HUMAN);
}

function copmLadder(decimals = 18): DenominationLadder {
  return buildLadder("copm", decimals, COPM_HUMAN);
}

/**
 * Pick ladder from token symbol. USDe (18 dec) still uses stables human sizes.
 */
export function ladderForToken(symbol: string, decimals: number): DenominationLadder {
  const s = symbol.trim().toUpperCase();
  if (s === "COPM") return copmLadder(decimals);
  if (s === "CELO" || s === "WMON" || s === "WETH" || s === "MON" || s === "ETH") {
    return nativeLadder(decimals);
  }
  // USDC, USDT, USDG, USDe, …
  return stablesLadder(decimals);
}

function toPacked(d: Denomination): PackedNote {
  return { denominationId: d.id, human: d.human, raw: d.raw };
}

export type AutoMixSplit = {
  /** Notes that fit Private denomination buckets (may be empty). */
  privateNotes: PackedNote[];
  privateRaw: bigint;
  /** Remainder that cannot pack into Private — deposit as one Standard note. */
  standardRaw: bigint;
};

/**
 * Auto Mix: pack as much as possible into Private buckets; send leftover to Standard.
 * Never asks the user — inexact / too_many_notes → private floor + standard remainder.
 */
export function splitAutoMix(
  amountRaw: bigint,
  ladder: DenominationLadder,
  maxNotes: number = MAX_NOTES_PER_RECIPIENT,
): AutoMixSplit {
  if (amountRaw <= 0n) {
    return { privateNotes: [], privateRaw: 0n, standardRaw: 0n };
  }
  if (ladder.descending.length === 0) {
    return { privateNotes: [], privateRaw: 0n, standardRaw: amountRaw };
  }

  const attempted = packAmount(amountRaw, ladder, maxNotes);
  if (attempted.ok) {
    return {
      privateNotes: attempted.notes,
      privateRaw: attempted.totalRaw,
      standardRaw: 0n,
    };
  }

  // Partial pack (inexact or hit max notes): keep packed buckets private; rest Standard.
  return {
    privateNotes: attempted.notes,
    privateRaw: attempted.totalRaw,
    standardRaw: attempted.remainderRaw,
  };
}


/**
 * Greedy pack (largest bucket ≤ remaining). v1 privacy UX requires exact coverage
 * (`ok: true` only when remainder is 0 and note count ≤ maxNotes).
 */
export function packAmount(
  amountRaw: bigint,
  ladder: DenominationLadder,
  maxNotes: number = MAX_NOTES_PER_RECIPIENT
): PackResult {
  if (ladder.descending.length === 0) {
    return { ok: false, notes: [], totalRaw: 0n, remainderRaw: amountRaw, reason: "empty_ladder" };
  }
  if (amountRaw <= 0n) {
    return { ok: false, notes: [], totalRaw: 0n, remainderRaw: amountRaw, reason: "amount_zero" };
  }

  const notes: PackedNote[] = [];
  let remaining = amountRaw;
  let totalRaw = 0n;

  for (const d of ladder.descending) {
    while (remaining >= d.raw) {
      if (notes.length >= maxNotes) {
        return { ok: false, notes, totalRaw, remainderRaw: remaining, reason: "too_many_notes" };
      }
      notes.push(toPacked(d));
      remaining -= d.raw;
      totalRaw += d.raw;
    }
  }

  if (remaining !== 0n) {
    return { ok: false, notes, totalRaw, remainderRaw: remaining, reason: "inexact" };
  }
  return { ok: true, notes, totalRaw, remainderRaw: 0n };
}

export function packHumanAmount(
  human: number | string,
  ladder: DenominationLadder,
  maxNotes: number = MAX_NOTES_PER_RECIPIENT
): PackResult {
  return packAmount(humanToRaw(human, ladder.decimals), ladder, maxNotes);
}

/**
 * Suggest floor (exact ≤ amount) and ceil (exact ≥ amount) payable totals.
 * Ceil searches upward by the ladder's GCD step (in raw units) with a bounded scan.
 */
export function suggestPayable(
  amountRaw: bigint,
  ladder: DenominationLadder,
  maxNotes: number = MAX_NOTES_PER_RECIPIENT
): PayableSuggestion {
  const attempted = packAmount(amountRaw, ladder, maxNotes);

  let floor: PackOk | null = null;
  if (attempted.notes.length > 0) {
    const floorPack = packAmount(attempted.totalRaw, ladder, maxNotes);
    if (floorPack.ok) floor = floorPack;
  } else if (attempted.ok) {
    floor = attempted;
  }

  let ceil: PackOk | null = null;
  if (attempted.ok) {
    ceil = attempted;
  } else {
    const step = gcdAll(ladder.descending.map((d) => d.raw));
    const smallest = ladder.descending[ladder.descending.length - 1]?.raw ?? 1n;
    // Bound: do not scan more than ~one large bucket above the target.
    const largest = ladder.descending[0]?.raw ?? amountRaw;
    const limit = amountRaw + largest;
    let candidate = amountRaw + ((step - (amountRaw % step)) % step);
    if (candidate < amountRaw) candidate += step;
    // Also try amount + remaining-to-next-smallest style bumps.
    const bumps = new Set<bigint>([candidate, amountRaw + (attempted.remainderRaw > 0n ? attempted.remainderRaw : smallest)]);
    for (const d of ladder.descending) {
      if (d.raw >= attempted.remainderRaw && attempted.remainderRaw > 0n) {
        bumps.add(attempted.totalRaw + d.raw);
      }
    }
    for (const b of bumps) {
      if (b < amountRaw || b > limit) continue;
      const p = packAmount(b, ladder, maxNotes);
      if (p.ok && (ceil === null || p.totalRaw < ceil.totalRaw)) ceil = p;
    }
    // Linear scan by gcd if still missing (capped iterations).
    if (!ceil && step > 0n) {
      let x = candidate;
      for (let i = 0; i < 5000 && x <= limit; i++, x += step) {
        const p = packAmount(x, ladder, maxNotes);
        if (p.ok) {
          ceil = p;
          break;
        }
      }
    }
  }

  return { attempted, floor, ceil };
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function gcdAll(values: bigint[]): bigint {
  if (values.length === 0) return 1n;
  return values.reduce((g, v) => gcd(g, v));
}

/** Collapse notes into "5,000 × 1 + 100 × 2 + …" style preview (human units). */
export function formatPackPreview(notes: PackedNote[]): string {
  if (notes.length === 0) return "—";
  const counts = new Map<string, { human: number | string; count: number }>();
  for (const n of notes) {
    const key = String(n.human);
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { human: n.human, count: 1 });
  }
  // Sort by numeric human desc when possible.
  const parts = [...counts.values()].sort((a, b) => {
    const na = typeof a.human === "number" ? a.human : Number(a.human);
    const nb = typeof b.human === "number" ? b.human : Number(b.human);
    return nb - na;
  });
  return parts
    .map(({ human, count }) => {
      const label = typeof human === "number" ? human.toLocaleString("en-US") : human;
      return count === 1 ? label : `${label} × ${count}`;
    })
    .join(" + ");
}
