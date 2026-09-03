# Native burn-and-mint exits (USDC CCTP + USDT0)

**Status:** proposed — **after** circuit/buckets work ([private-amounts-and-batch-deposit.md](private-amounts-and-batch-deposit.md))  
**Not in v1 buckets/batch scope.**

## Why this feature

Buckets + batch improve *pool-local* unlinkability. They do **not** hide the ERC-20 `Transfer` amount on unshield, and indexers may still label funds that left a shielded pool.

Native **burn → attest → mint** rails (Circle CCTP for USDC, USDT0/OFT for USDT) let a grantee move stables to another chain as a **fresh mint**. That can:

1. **Break same-chain trail** — claim on payout chain → burn → mint on dest as Circle/Tether-native USDC/USDT0.
2. **Improve offramp hygiene** — mint edge looks like official bridge infra, not only “left shielded pool”.
3. **Multichain grants UX** — note is in token T on chain A; user receives USDC/USDT on chain B in one claim action.

This is **claim-time exit + portability**, not a substitute for denomination buckets.

---

## Target UX (claim screen)

On `/receive/[id]` (before Claim), in addition to destination address:

### 1. Receive asset

Select:

| Option | Meaning |
|--------|---------|
| **Original token** | Same asset as the note (e.g. COPm, CELO, WMON, or local USDC/USDT) — **no bridge**; claim only |
| **USDC** | After claim (and any same-chain swap if note ≠ USDC — see open questions), exit via **CCTP** |
| **USDT** | After claim (and swap if needed), exit via **USDT0** |

If the note is already USDC, choosing USDC skips swap and only offers CCTP dest chains.  
If the note is already USDT, choosing USDT → USDT0 routes only.

### 2. Destination chain (only if USDC or USDT)

Second select: **chains available for that rail** from the payout (source) chain.

- USDC → CCTP-supported dest domains we enable (e.g. Ethereum, Arbitrum, Base, …).
- USDT → USDT0 OFT-supported dest EIDs we enable.
- Hide unsupported pairs; never show a chain we cannot quote.

### 3. Destination wallet

Existing address field (vault). Funds mint / arrive there on the **selected dest chain** (or same chain if Original).

### 4. Fee breakdown (before Claim)

Show line items (quoted live):

| Fee | Who | Source |
|-----|-----|--------|
| **Bridge / protocol fee** | Circle CCTP or USDT0/LayerZero (+ messaging gas where applicable) | `quote` APIs |
| **Blizkperse platform fee** | Us | Configurable bps or flat on bridged notional |
| **Net to recipient** | User | Note amount − fees (and − swap slippage if any) |

Native gas on source for claim and/or bridge messaging may still apply unless covered by Alchemy AA (claim) / user pays LZ native fee (USDT0).

### 5. One button: Claim / Claim & bridge

User confirms **once** (one intentional click; wallet may prompt per tx unless batched).

Behind the scenes (orchestrated by the app):

```text
[optional same-chain swap note-token → USDC/USDT]
  → withdraw/claim note to intermediate or vault
  → take platform fee
  → CCTP burn / USDT0 send
  → wait attestation
  → mint / deliver on dest chain to destination address
```

Progress UI: same `TxStatus` style — steps e.g. `Claiming…` → `Bridging…` → `Waiting attestation…` → `Received on {chain}`.

---

## Orchestration model

**Product requirement:** feel like one action. **Implementation:** likely multiple txs unless a dedicated “claim-and-bridge” router exists.

| Approach | Pros | Cons |
|----------|------|------|
| **App orchestration (v1)** | No new pool contracts; reuse claim + Bridge Kit / OFT | Multiple wallet signatures unless AA/session; failure mid-flow needs resume |
| **Router contract (later)** | Claim → fee → burn in fewer user ops | New audit surface; AA + hooks complexity |

**v1 recommendation:** app-orchestrated pipeline with **idempotent resume** (if claim succeeded but bridge pending, “Continue bridge” without re-claiming). Prefer Alchemy smart account / batching where possible so the user experiences **one approval**.

Claim `recipient` on-chain for bridged exits:

- Prefer claim to a **controlled exit path** (user-held vault that immediately bridges, or future router), not leave dust on a random EOA mid-flow.
- Exact address (EOA vs ephemeral vs router) is an implementation decision; document in backlog.

---

## Fees

### Bridge / protocol

- **USDC CCTP:** Circle Fast vs Standard fees; optional forwarding/upfront fee models — use official quote.
- **USDT0:** OFT fee details from `quoteOFT` + LayerZero `quoteSend` native fee.
- Pass through to UI as “Bridge fee”.

### Platform (Blizkperse)

- Charged **only when a bridge exit is selected** (not on Original-token same-chain claim), unless product later wants a claim fee too.
- Suggested knobs: `BRIDGE_PLATFORM_FEE_BPS` (and optional min flat).
- Collection options (pick in implementation):
  1. Deduct from amount before burn (recipient gets less on dest).
  2. Separate transfer to treasury on source after claim.
- Treasury address: align with existing protocol fee treasury or a dedicated bridge-fee receiver.

Quote must be **all-in** before the user signs: note gross → platform fee → bridge fee → **net on destination**.

---

## Protocols (summary)

### USDC — Circle CCTP

- Docs: [CCTP](https://developers.circle.com/cctp), [chains/domains](https://developers.circle.com/cctp/concepts/supported-chains-and-domains), [addresses](https://developers.circle.com/cctp/references/contract-addresses), [technical guide](https://developers.circle.com/cctp/references/technical-guide).
- **Burn → Iris attest → mint**; prefer **CCTP V2**.
- Frontend helper: [`@circle-fin/bridge-kit`](https://www.npmjs.com/package/@circle-fin/bridge-kit).

### USDT — USDT0 (LayerZero OFT)

- Docs: [use cases](https://docs.usdt0.to/overview/use-cases), [developer](https://docs.usdt0.to/technical-documentation/developer/).
- OFT burn/mint (Ethereum often lock/unlock vs canonical USDT); **3/3 DVNs**.
- Prefer native OFT over **Legacy Mesh** (credit pools, ~0.03% fee) when both exist.

---

## Prerequisites (ordering)

1. Buckets + `depositBatch` + withdraw `denomination_id` ([private-amounts-and-batch-deposit.md](private-amounts-and-batch-deposit.md)).
2. Route matrix: source chain × receive asset × dest chains.
3. Implement claim-screen orchestration (this doc).

Do **not** block circuit work on bridges.

---

## Implementation backlog (Phase 4 — after circuits)

### Spec

- [ ] Route matrix (CCTP / USDT0 / unsupported) for Monad, Celo, Robinhood, …
- [ ] Platform fee bps + treasury
- [ ] Policy when note token ∉ {USDC, USDT}: disallow bridge options vs same-chain swap then bridge
- [ ] Resume / recovery if claim ok and bridge fails

### Build

- [ ] Claim UI: receive-asset select + conditional dest-chain select + fee breakdown
- [ ] Orchestrator: claim → platform fee → CCTP or USDT0
- [ ] Single CTA; progress steps; idempotent continue
- [ ] Quotes: bridge + platform → net
- [ ] Env: CCTP/USDT0 addresses from official deployments
- [ ] Terms: third-party rails, freezes, fees disclosed

### Later

- [ ] On-chain claim-and-bridge router (fewer signatures)
- [ ] CCTP hooks on dest
- [ ] Circle Gateway
- [ ] Auto same-chain swap (COPm → USDC) before bridge

---

## Open questions

1. If note is **COPm/CELO**, do we offer USDC/USDT only after a swap module, or hide those options until note is already USDC/USDT?
2. Platform fee: bps only, or bps + minimum?
3. Hard requirement of **literally one** wallet signature vs “one button” with batched UserOps?
4. Dest address must equal connected wallet on dest, or any paste (recommended: any paste, like today)?

---

## Risks

| Risk | Mitigation |
|------|------------|
| Mid-flow failure after claim | Persist claim tx; Resume bridge |
| Multi-signature friction | AA batch / clear step list |
| Unsupported route shown | Matrix-driven selects only |
| Fee surprise | Quote net before Claim |
| User thinks amount is hidden | Copy: claim on source still visible; bridge is portability |

---

## References

- https://developers.circle.com/cctp  
- https://www.npmjs.com/package/@circle-fin/bridge-kit  
- https://developers.circle.com/llms.txt  
- https://docs.usdt0.to/overview/use-cases  
- https://docs.usdt0.to/technical-documentation/developer/  

---

## Summary

On the **claim screen**, user picks **Original | USDC | USDT**, and if USDC/USDT a **destination chain**, then one **Claim** CTA. App runs claim + bridge; fees = **bridge protocol + Blizkperse platform**. Ship **after** denomination circuits. Complements buckets; does not replace them.
