# Private withdraw amounts + batch deposit

Design note for improving grant/payroll privacy **without** unifying multi-token Merkle trees.

**Status:** accepted direction (buckets + batch + UI toggle)  
**Related:** [arbitrary-amounts-multitoken.md](arbitrary-amounts-multitoken.md), [test-deposit-withdraw.md](test-deposit-withdraw.md) (what is public today)  
**Product case:** DAO distributes heterogeneous grants; amounts/grantees are public off-chain; recipients want vaults that are not honeypots; infra must not look like a generic mixer.

---

## 0. Locked decisions

| Decision | Choice |
|----------|--------|
| Privacy model | **Fixed denominations (buckets)** — not range proofs in v1 |
| Multi-token Merkle | **Rejected** (keep 1 pool = 1 token = 1 tree) |
| Funding | **`depositBatch`**: one transfer of Σ notes (+ fee); N commitments; no per-note amounts in aggregate event |
| Deposit proofs (v1) | **N existing `deposit.nr` proofs** inside one `depositBatch` tx |
| Withdraw | Note `value` **private**; public **`denomination_id`**; ERC-20 transfer still shows bucket size (anonymity by repetition) |
| UI | **Same Create Payout flow**; mode toggle **Standard** vs **Private buckets** (not a new tab) |
| Stables (6 decimals) bucket set | **Finer:** 50, 100, 250, 500, 1 000, 2 500, 5 000, 10 000, 25 000, 50 000 |

---

## 1. Problem (today)

| Surface | What is public | Consequence |
|---------|----------------|-------------|
| Deposit (per note) | One tx per recipient; `Deposit` / `RoutedDeposit` includes **exact `amount`** | Grant list of 3k / 8k / 3.5k maps 1:1 to on-chain deposits |
| Withdraw | Public inputs include **`value`** + **`recipient`**; ERC-20 transfer confirms amount | Claim of exactly 8k to `0x…` tags that wallet as the 8k grantee |
| Note owner | `pk_b` stays private | Deposit ↔ note holder unlink is OK; amount/recipient still leak |

App behavior: `createPayout` loops recipients and calls `depositNote` once each (`web/lib/store.ts`).

**Why buckets still matter with “private” withdraw:** removing `value` from ZK public inputs does not hide the ERC-20 `Transfer` amount. Buckets make many exits look identical so a published grant size does not uniquely tag a vault.

---

## 2. Goals

1. **Deposit (Private mode):** observer sees treasury → pool **total**, not per-grantee amounts.
2. **Withdraw (Private mode):** exits only in allowlisted sizes; no unique odd amounts in public inputs.
3. Keep **1 pool = 1 token = 1 tree**.
4. Stay positionable as **shielded payroll/grants**, not Tornado-class mixing.
5. Preserve deposit safety: cannot inflate note `value` beyond the chosen denomination.

Non-goals (v1): hide recipient in ZK; hide claim `msg.sender` (relayer later); FHE; cross-token notes; fully amount-hidden L1 ERC-20.

---

## 3. Denomination tables

Amounts below are **human units** of the token (not USD necessarily). On-chain storage = human × `10^decimals`.

### 3.1 Stables — 6 decimals (USDC, USDT, USDG, USDe if 6)

| id | Human amount | Raw (`10^6`) |
|----|--------------|--------------|
| 0 | 50 | 50_000_000 |
| 1 | 100 | 100_000_000 |
| 2 | 250 | 250_000_000 |
| 3 | 500 | 500_000_000 |
| 4 | 1_000 | 1_000_000_000 |
| 5 | 2_500 | 2_500_000_000 |
| 6 | 5_000 | 5_000_000_000 |
| 7 | 10_000 | 10_000_000_000 |
| 8 | 25_000 | 25_000_000_000 |
| 9 | 50_000 | 50_000_000_000 |

Same id table can be shared across 6-decimal stables unless product wants per-token overrides later.

### 3.2 Native / 18-decimal tokens (draft — confirm before ship)

Use a **parallel ladder** in token units (not USD), so anonymity sets form within that pool:

| id | Human amount | Example tokens |
|----|--------------|----------------|
| 0 | 0.1 | CELO, WMON, WETH, COPm* |
| 1 | 0.5 | |
| 2 | 1 | |
| 3 | 5 | |
| 4 | 10 | |
| 5 | 25 | |
| 6 | 50 | |
| 7 | 100 | |
| 8 | 250 | |
| 9 | 500 | |

\*COPm is COP-denominated; product may prefer a COP-sized ladder (e.g. 50k / 100k / 500k COP) instead of “0.1 COPm”. **Open:** finalize COPm / CELO / WMON / WETH tables separately from stables.

### 3.3 Splitter algorithm (deterministic)

Given desired grant `G` and sorted denominations descending `D[]`:

1. **Greedy:** repeatedly take largest `d ∈ D` with `d ≤ remaining`.
2. If remainder `r > 0` and `r` not in `D`: either  
   - **floor policy (v1):** leave `r` unpaid / warn organizer to top up to next bucket, or  
   - **ceil policy:** add one smallest bucket that covers `r` (overpay note — usually bad), or  
   - **require exact:** only allow `G` that sum exactly from buckets (strictest privacy UX).

**v1 recommendation:** greedy + **exact coverage required** (disable Confirm if remainder ≠ 0), with a helper “Round to nearest payable” that bumps/trims `G` so it packs exactly.

Example: `8_432` USDC with finer set → not exact with greedy alone if 32 left; UI suggests `8_450` (`5k+2.5k+1k×0+…`) or packs `8_250 + 100×1 + 50×1` etc. after helper.

Document the exact packer in `web/lib/denominations.ts` when implementing.

### 3.4 Max notes

Cap notes per recipient and per batch (gas / calldata for N deposit proofs), e.g.:

- Max **20 notes per recipient** after split  
- Max **64 notes per `depositBatch`** (tune after gas benchmarks)

---

## 4. Batch deposit

### On-chain shape (Private mode)

1. `approve` gross `Σ noteAmounts + fees`.
2. `PoolRouter.depositBatch(token, commitments[], denominationIds[], proofs[], publicInputs[][])` (shape TBD):
   - one `transferFrom` of Σ raw amounts (+ fee to treasury);
   - verify each deposit proof; each `value == denominations[id]`;
   - insert N commitments;
   - emit `BatchDeposit(user, token, pool, totalAmount, fee, count)` — **no per-note amounts**;
   - optional `CommitmentInserted(commitment, denominationId)` without raw amount.

### Safety invariants

- `Σ denominationAmounts == net tokens to pool`.
- Each id in allowlist; each commitment unused.
- Still one token per pool.

### Standard mode (unchanged path)

Keep current per-note `deposit` with arbitrary amounts for organizers who do not need deposit/withdraw amount privacy (or until buckets are default).

---

## 5. Withdraw (Private / denomination notes)

### Circuit sketch

Today: public `value, nullifier, merkle_proof_length, expected_merkle_root, recipient`.

Target: private `value`; public `nullifier, merkle_proof_length, expected_merkle_root, recipient, denomination_id`.  
Proof asserts `value == denominations[denomination_id]` (id checked on-chain or bound in circuit).

Contract transfers exactly `denominations[id]`. Explorer still sees that ERC-20 amount — privacy = **many identical bucket exits**.

### Events

`Withdraw(recipient, nullifier, denominationId)` preferred over raw amount in event data.

---

## 6. UI

**No new tab.** Extend `/payer/create`:

| Step | Standard | Private buckets |
|------|----------|-----------------|
| Select | Subscribers | Same |
| Amounts | Free amount per person | Amount + live pack preview (“8 450 → 5k + 2.5k + 1k×0 + …”) |
| Review | 1 note / person | Note breakdown per person; copy: on-chain batch shows **total**, not per-grantee split |
| Deposit | N txs (today) | Prefer single `depositBatch` |

Mode control: segmented control or switch near Token selector: **Standard | Private buckets**.

Receive/claim: one payment may map to **multiple notes**; show “N notes · buckets …” and claim one-by-one or “Claim all” (product choice — default **one-by-one** v1 for simpler tx status).

Dashboard badge on recent payouts: `Standard` / `Private`.

---

## 7. Threat model after v1 (Private mode)

Still public: depositor, batch total, token, note count, claim `msg.sender`, `recipient`, **bucket size**, timing.

Improved: per-grantee deposit amounts hidden in batch; withdraw amounts only as common buckets; note owner still private.

Not solved: unique vault reuse; timing; offramp heuristics; fully hidden ERC-20 amounts.

---

## 8. Implementation backlog

### Phase 0 — Spec (this doc)

- [x] Choose buckets model + finer stable ladder  
- [x] UI = toggle on Create Payout  
- [ ] Confirm 18-decimal / COPm ladders  
- [ ] Lock splitter exact-vs-round policy  
- [ ] Gas estimate → max notes per batch  

### Phase 1 — Lib + contracts + circuits

- [ ] `web/lib/denominations.ts` — tables, packer, preview helpers  
- [ ] On-chain denomination allowlist (`setDenominations`)  
- [ ] `depositBatch`  
- [ ] Withdraw circuit + verifier with `denomination_id`  
- [ ] Foundry tests: wrong id, Σ mismatch, inflate value, nullifier replay  

### Phase 2 — App

- [ ] Create Payout mode toggle + pack preview + exact-pack validation  
- [ ] Batch deposit path in `store.ts`  
- [ ] Claim multi-note UX  
- [ ] Terms / README privacy wording  

### Phase 3 — Optional

- [ ] Single batch-deposit circuit  
- [ ] Relayer  
- [ ] Range proofs if buckets UX fails  

### Phase 4 — After circuits (separate doc)

- [ ] Claim-time exit: Original | USDC | USDT + dest chain; one CTA (claim + bridge); bridge + platform fees — see [native-burn-mint-exits.md](native-burn-mint-exits.md)

---

## 9. Remaining open questions

1. COPm / CELO / WMON / WETH exact ladders?  
2. Exact-only grants vs auto-round helper default?  
3. Max notes per batch after gas bench?  
4. Claim all vs one-by-one as default?  
5. Redeploy pools vs upgrade path for new withdraw verifier?

---

## 10. Summary

Ship **Private buckets**: finer stable denominations, **batch deposit** for totals, **denomination_id** withdraw, **same Create Payout UI with a mode toggle**. Keep per-token pools. Do not unify trees. ERC-20 exit amounts remain visible but non-unique within each bucket.
