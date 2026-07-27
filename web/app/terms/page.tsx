import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Terms & Conditions | Blizkperse",
  description:
    "Terms of use for Blizkperse — experimental ZK shielded-pool payout software.",
};

const EFFECTIVE_DATE = "July 26, 2026";
const VERSION = "v1.0.0";

/** Monorepo — contracts, circuits, and frontend live in the same GitHub repo. */
const REPO = "https://github.com/Blizkperse/blizkperse";
const REPO_CONTRACTS = `${REPO}/tree/main/zk/contract`;
const REPO_CIRCUITS = `${REPO}/tree/main/zk/circuits`;
const REPO_FRONTEND = `${REPO}/tree/main/web`;

/**
 * Production addresses as configured for the hosted app (Celo 42220 / Monad 143 /
 * Robinhood 4663) and verified on-chain via public RPC reads (feeBps, treasury,
 * owner, poolOf). Do not invent missing pools — only list deployments that exist.
 */
const DEPLOYMENTS = {
  celo: {
    chainId: 42220,
    router: "0xFB9eBD23cD1A58C6B670653C98a49Fb4cb7A2c0e",
    pools: [
      {
        symbol: "USDT",
        pool: "0x4319216C4f9343702Bee96345da0099F3dD5a7C1",
        token: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
      },
      {
        symbol: "COPm",
        pool: "0x5862FFF8085d009354d78273DC8f8545f51dB72F",
        token: "0x8A567e2aE79CA692Bd748aB832081C45de4041eA",
      },
    ],
    transferVerifier: "0x49E2c70927F571B86a36F1C780D713A58703bfDF",
    withdrawVerifier: "0x177cADF8C301A0f1264F402ed2c58e95223b5b2D",
    depositVerifier: "0xD4dFD33Ae7c1f2B034D442ddCB0535BD43325DB4",
  },
  monad: {
    chainId: 143,
    router: "0x0bAF1357eD81Bd200f0DF7ea559af550C2E5b1a7",
    pools: [
      {
        symbol: "USDC",
        pool: "0x3c3526931e4D4F204a6418D11B173dC07e0c0bc7",
        token: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
      },
    ],
    transferVerifier: "0xcDC754C538968434AfBc2f2c545A8261063Fa05E",
    withdrawVerifier: "0xcAAb0B768993663145fc1467029Da7E7E6a1b52D",
    depositVerifier: "0x50b78768E965Eeed19613D3B0Cd0245B1A12D351",
  },
  robinhood: {
    chainId: 4663,
    router: "0xcDc6AdE9d348572f302690bD39BA8120F8E91db3",
    pools: [
      {
        symbol: "USDG",
        pool: "0xf62E5a932a832C8EA990DedD87a05162C8905224",
        token: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      },
      {
        symbol: "USDe",
        pool: "0x038803A40130734E6aB711489060Ea55F05BB475",
        token: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
      },
      {
        symbol: "WETH",
        pool: "0x27c575a0CDbBAcCFaCC6085164186B19F74b77B4",
        token: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      },
    ],
    transferVerifier: "0x8d10Ad45B21d4db2e7270E519a757c764c6501Ac",
    withdrawVerifier: "0xD9AeE9351f7685b05a6B7BD8c1Ca509D24bE1e57",
    depositVerifier: "0x1d42C0cD5fF14Ee71456473828996b1bC251a735",
  },
  /** On-chain PoolRouter.feeBps / treasury / Ownable.owner (same EOA on both chains as of July 26, 2026). */
  feeBps: 30,
  treasuryAndOwner: "0xc696DDC31486D5D8b87254d3AA2985f6D0906b3a",
} as const;

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-amber-500/15 px-1 font-mono text-[0.85em] text-amber-100/95">
      {children}
    </span>
  );
}

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="container mx-auto max-w-3xl flex-1 px-4 py-10">
        <aside
          className="mb-8 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90"
          role="note"
        >
          <strong className="font-semibold text-amber-50">
            Draft — counsel review required.
          </strong>{" "}
          This document is a founder draft for discussion. It is not legal
          advice. Have qualified counsel review and customize it before relying
          on it in production or presenting it as binding terms. Yellow{" "}
          <Placeholder>[DECISION]</Placeholder> markers need founder/legal
          choices; they were not invented from the codebase.
        </aside>

        <header className="mb-10 space-y-2">
          <p className="text-xs font-mono text-muted-foreground">
            {VERSION} · Effective {EFFECTIVE_DATE}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            Terms &amp; Conditions
          </h1>
          <p className="text-muted-foreground">
            Blizkperse is experimental software for ZK shielded-pool payouts and
            claims on supported networks (including Celo and Monad). It is not a
            bank, custodian, or a guarantee of mixer-style confidentiality.
          </p>
        </header>

        <article className="prose-terms space-y-8 text-sm leading-relaxed text-foreground/90">
          <Section title="Definitions">
            <p>
              <strong className="text-foreground">&quot;THE SOFTWARE&quot;</strong>{" "}
              means the open-source smart contracts, ZK circuits, indexers,
              frontends, and related code deployed at the contract addresses
              listed in Appendix A, as well as any forks, upgrades, or
              derivatives thereof.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">&quot;CONTRIBUTORS&quot;</strong>{" "}
              means the individuals and entities who have submitted code,
              documentation, or operational support to the repositories at{" "}
              <a
                className="underline-offset-4 hover:underline"
                href={REPO}
                target="_blank"
                rel="noreferrer"
              >
                {REPO}
              </a>
              , with no principal-agent relationship between them. Contributors
              act independently and not as representatives of any entity.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">
                &quot;CORE CONTRIBUTORS&quot;
              </strong>{" "}
              means those Contributors listed in Appendix B who have
              decision-making authority over protocol parameters, upgrades, or
              treasury management.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">
                &quot;USER&quot; or &quot;YOU&quot;
              </strong>{" "}
              means any person accessing, interacting with, or using the
              Software.
            </p>
          </Section>

          <Section title="1. Acceptance and Sophisticated Investor Acknowledgment">
            <p>
              <strong className="text-foreground">1.1 Acceptance.</strong> By
              accessing or using the Blizkperse application, websites, smart
              contracts, APIs, or related interfaces (collectively, the
              &quot;Software&quot;), you agree to these Terms. If you do not
              agree, do not use the Software.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">
                1.2 Sophisticated Investor Acknowledgment.
              </strong>{" "}
              YOU REPRESENT AND WARRANT THAT: (a) you are sophisticated in
              blockchain technology, zero-knowledge cryptography, and
              decentralized finance protocols; (b) you understand that the
              Software is experimental, unaudited or partially audited, and may
              contain bugs, vulnerabilities, or economic flaws; (c) you are
              capable of evaluating the risks of using ZK shielded pools,
              including the risk of total loss of funds; (d) you are not relying
              on any Contributor, documentation, or community discussion as
              investment advice, legal advice, or guarantee of functionality;
              (e) you have sufficient knowledge and experience in financial and
              technical matters to evaluate the merits and risks of using the
              Software; (f) you are able to bear the economic risk of loss of
              your entire deposit, and you acknowledge that you may lose all
              funds without recourse. If you do not meet these criteria, you must
              not use the Software.
            </p>
          </Section>

          <Section title="2. Nature of the Software">
            <p>
              Blizkperse provides tools to fund and claim payouts through
              zero-knowledge (&quot;ZK&quot;) shielded-pool smart contracts on
              public blockchains. The Software is:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>
                Experimental software that may contain bugs, incomplete features,
                or breaking changes;
              </li>
              <li>
                Self-custody oriented — you control your keys, wallets, and
                on-chain actions;
              </li>
              <li>
                Not a bank, broker, exchange, escrow agent, or financial
                institution — no Contributor holds user funds as a depositary;
              </li>
              <li>
                Not a promise of strong anonymity or mixer-grade confidentiality
                — see Section 10 (Privacy &amp; On-Chain Visibility);
              </li>
              <li>
                Open-source and freely forkable, but{" "}
                <strong className="text-foreground/90">
                  not operated without any controlling party
                </strong>
                : live deployments use Ownable admin keys, a protocol fee
                treasury, a backend Merkle root registrar, and a hosted frontend /
                indexer. Anyone may deploy their own fork; that does not mean the
                instances listed in Appendix A lack operators;
              </li>
              <li>
                Subject to parameter changes, new deployments, forks, or
                abandonment based on decisions of contract owners / Contributors
                (see Section 7 and Appendix A).
              </li>
            </ul>
            <p className="mt-3">
              Frontends may be hosted by various parties; use of any frontend is
              at your own risk. Contributors do not guarantee the availability,
              accuracy, or security of any frontend, RPC endpoint, or indexer.
            </p>
          </Section>

          <Section title="3. Contributors Act Independently">
            <p>
              CONTRIBUTORS ACT INDEPENDENTLY. Each Contributor acts in their
              personal capacity and not as agent, employee, partner, or
              representative of any other Contributor or of
              &quot;Blizkperse.&quot; There is no partnership, joint venture,
              association, or legal entity binding Contributors. No Contributor
              is responsible for the acts, omissions, smart contracts, or code of
              another Contributor.
            </p>
          </Section>

          <Section title="4. AI-Assisted Development Disclosure">
            <p>
              Portions of the Software codebase, documentation, and related
              materials were generated or assisted by artificial intelligence
              tools. AI-assisted output may contain errors, insecure patterns, or
              incomplete edge-case handling. You acknowledge this disclosure and
              accept that use of AI in development does not create any warranty,
              guarantee of correctness, audit completeness, or liability for any
              Contributor beyond what these Terms expressly provide.
            </p>
          </Section>

          <Section title='5. No Warranty — Software Provided "As Is"'>
            <p>
              THE SOFTWARE, INCLUDING SMART CONTRACTS, CIRCUITS, INDEXERS,
              FRONTENDS, AND ANY RELATED CODE, IS PROVIDED{" "}
              <strong className="text-foreground">
                &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot;
              </strong>{" "}
              WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR
              STATUTORY, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR
              PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, OR UNINTERRUPTED
              AVAILABILITY.
            </p>
            <p className="mt-3">
              You use the Software at your sole risk. No Contributor warrants that
              the Software is secure, bug-free, or suitable for any purpose. You
              acknowledge that ZK cryptography is an evolving field and that the
              circuits and verifiers may contain undiscovered vulnerabilities.
            </p>
          </Section>

          <Section title="6. Assumption of Risk — Possible Total Loss of Funds">
            <p>
              Cryptocurrency and ZK protocols involve substantial risk. You may
              lose some or all funds deposited into, routed through, or claimed
              from the shielded pool or related contracts. Risks include, without
              limitation:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>Smart contract bugs, circuit flaws, or verifier errors;</li>
              <li>Key loss, compromised wallets, phishing, or malware;</li>
              <li>
                Chain reorganizations, congestion, forks, or network failures;
              </li>
              <li>
                Indexer, API, prover, root-registrar, or front-end outages that
                delay or prevent claims;
              </li>
              <li>
                Failed, stuck, or incorrectly parameterized deposits, proofs, or
                withdrawals;
              </li>
              <li>
                Protocol parameter changes, misconfiguration, or third-party
                dependency failures;
              </li>
              <li>
                Regulatory, sanctions, or enforcement actions affecting access or
                usability;
              </li>
              <li>Front-running, MEV extraction, or sandwich attacks;</li>
              <li>
                Compromise of trusted setup parameters or toxic waste in ZK
                circuits.
              </li>
            </ul>
            <p className="mt-3">
              No Contributor is responsible for funds lost in the pool or
              otherwise through use of the Software.
            </p>
          </Section>

          <Section title="7. Smart Contracts, Immutability, and No Reversal">
            <p>
              On-chain transactions are generally irreversible. Neither the
              Software nor any Contributor can reverse, claw back, or restore
              transfers, deposits, nullifiers, or claims once confirmed on-chain.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">
                Core contracts are not proxy-upgradeable.
              </strong>{" "}
              <code className="text-foreground/90">ShieldedPool</code>,{" "}
              <code className="text-foreground/90">PoolRouter</code>, and the
              Honk verifier contracts (
              <code className="text-foreground/90">DepositVerifier</code>,{" "}
              <code className="text-foreground/90">WithdrawVerifier</code>, and
              the transfer verifier) are deployed as ordinary contracts — there
              is no UUPS, Transparent Proxy, or Beacon proxy. Bytecode at a given
              address cannot be replaced. Token and verifier addresses on each{" "}
              <code className="text-foreground/90">ShieldedPool</code> are{" "}
              <code className="text-foreground/90">immutable</code> constructor
              parameters.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">
                Operational admin surface (Ownable), not logic upgrades:
              </strong>{" "}
              both <code className="text-foreground/90">ShieldedPool</code> and{" "}
              <code className="text-foreground/90">PoolRouter</code> inherit
              OpenZeppelin <code className="text-foreground/90">Ownable</code>.
              The current owner (verified on-chain as of the Appendix A snapshot)
              may: (i) on each pool, call{" "}
              <code className="text-foreground/90">setRouter</code> and{" "}
              <code className="text-foreground/90">setRootRegistrar</code>; (ii)
              on the router, call{" "}
              <code className="text-foreground/90">setPool</code>,{" "}
              <code className="text-foreground/90">setWrappedNative</code>, and{" "}
              <code className="text-foreground/90">setFeeConfig</code> (fee rate
              and treasury, capped at 10% / 1000 bps); (iii) transfer or renounce
              ownership. There is no{" "}
              <code className="text-foreground/90">setDepositVerifier</code> /
              swap of circuit logic at an existing pool address — a new circuit
              requires a new verifier + pool deployment and user migration.
              Claims also depend on an off-chain root registrar authorized via{" "}
              <code className="text-foreground/90">rootRegistrar</code>.
            </p>
            <p className="mt-3">
              Do not deposit funds you cannot afford to lose.
            </p>
          </Section>

          <Section title="8. Fees, Gas, and User Responsibilities">
            <p>
              You are solely responsible for network gas, wallet fees, and any
              protocol fees charged by the Software. Where a PoolRouter is
              configured, a protocol fee of{" "}
              <strong className="text-foreground">
                {DEPLOYMENTS.feeBps} basis points (0.3%)
              </strong>{" "}
              is charged <em>on top of</em> note amounts (payer sends{" "}
              <code className="text-foreground/90">amount + fee</code>; the note /
              pool credit equals <code className="text-foreground/90">amount</code>
              ; the treasury receives the fee). On-chain{" "}
              <code className="text-foreground/90">feeBps</code> as of the
              Appendix A snapshot is {DEPLOYMENTS.feeBps}; the owner may change
              fee configuration via{" "}
              <code className="text-foreground/90">setFeeConfig</code>. Fee
              changes apply only to deposits made after the change; existing notes
              are unaffected.
            </p>
            <p className="mt-3">
              You are responsible for: securing private keys and recovery
              material; verifying contract addresses, networks, and transaction
              parameters before signing; complying with all applicable laws and
              regulations in your jurisdiction, including tax, sanctions,
              anti-money-laundering, and securities laws; and determining whether
              use of the Software is legal in your jurisdiction.
            </p>
          </Section>

          <Section title="9. Not Financial, Legal, or Tax Advice">
            <p>
              Nothing in the Software, documentation, or community channels
              constitutes financial, investment, legal, tax, or accounting advice.
              You should obtain independent professional advice before using crypto
              or ZK products.
            </p>
            <p className="mt-3">
              The Software is not offered where prohibited. You represent that you
              are not located in, or a resident of, a jurisdiction where use would
              be unlawful, and that you are not a sanctioned person or entity on
              any applicable sanctions list (including OFAC, UN, EU, UK).
            </p>
          </Section>

          <Section title="10. Privacy &amp; On-Chain Visibility">
            <p>
              Blizkperse uses zero-knowledge techniques to support shielded-pool
              payouts, but it is{" "}
              <strong className="text-foreground">
                not a strong mixer and does not promise anonymity or
                confidentiality
              </strong>
              .
            </p>
            <p className="mt-3">
              While ZK proofs are intended to obscure the cryptographic link
              between a specific deposit note and a later withdrawal, the
              following remain public on-chain: (i) that a deposit occurred and
              the depositor address; (ii) the token type and the{" "}
              <strong className="text-foreground">
                exact note amount
              </strong>{" "}
              (the deposit circuit&apos;s public inputs are{" "}
              <code className="text-foreground/90">[value, commitment]</code>, and
              the pool requires <code className="text-foreground/90">value == amount</code>
              ); (iii) that a withdrawal occurred; (iv) the recipient address and
              exact withdraw amount in the withdraw public inputs. Blockchain
              analytics may infer patterns or correlate timing. This is not
              cryptographic anonymity; it is at most limited unlinkability within
              a pool under favorable conditions.
            </p>
            <p className="mt-3">
              Off-chain app data (e.g. invite links, organizer metadata) may be
              logged or stored by frontends or indexers. Do not treat the Software
              as private banking or untraceable cash.
            </p>
          </Section>

          <Section title="11. Prohibited Uses">
            <p>You represent that you will not use the Software to:</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>
                Conceal proceeds of crime, money laundering, or terrorist
                financing;
              </li>
              <li>Evade taxes or circumvent capital controls;</li>
              <li>Violate applicable sanctions or trade embargoes;</li>
              <li>Harass, abuse, or harm others;</li>
              <li>
                Interfere with or disrupt the Software or networks connected to
                it.
              </li>
            </ul>
            <p className="mt-3">
              Contributors reserve the right to block interfaces or IP addresses
              associated with sanctioned entities or prohibited jurisdictions
              regardless of technical capability to enforce at the smart contract
              level.
            </p>
          </Section>

          <Section title="12. Limitation of Liability">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, NO CONTRIBUTOR SHALL BE
              LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
              EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF FUNDS,
              CRYPTOCURRENCY, DATA, PROFITS, OR BUSINESS OPPORTUNITY, ARISING FROM
              OR RELATED TO THE SOFTWARE — INCLUDING LOSS OF FUNDS IN THE
              SHIELDED POOL — WHETHER BASED ON CONTRACT, TORT, STRICT LIABILITY,
              OR OTHERWISE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p className="mt-3">
              Where liability cannot be fully excluded, each Contributor&apos;s
              aggregate liability for all claims relating to the Software shall
              not exceed the greater of (a) the protocol fees you paid to that
              specific Contributor&apos;s deployed contracts (if any) in the
              thirty (30) days preceding the claim, or (b) one hundred U.S.
              dollars (US$100), or the equivalent in local currency.
            </p>
            <p className="mt-3">
              Each Contributor&apos;s liability is several (not joint) and limited
              as above. No Contributor is liable for the acts or omissions of
              another Contributor.
            </p>
          </Section>

          <Section title="13. Indemnification">
            <p>
              You agree to defend, indemnify, and hold harmless Contributors from
              and against claims, damages, losses, and expenses (including
              reasonable legal fees) arising out of your use of the Software, your
              violation of these Terms, or your violation of any law or
              third-party right.
            </p>
          </Section>

          <Section title="14. Changes to the Software or Terms">
            <p>
              The Software may have parameters changed by whoever holds Ownable
              keys (see Section 7 and Appendix A), or may be superseded by new
              deployments / forks. Contributors have no obligation to maintain,
              update, or support the Software. You interact with these contracts
              at your own risk.
            </p>
            <p className="mt-3">
              We may update these Terms by posting a revised version with 15
              days&apos; notice for material changes. Continued use after the
              notice period constitutes acceptance. Historical versions remain
              applicable to disputes arising during their effective period.
            </p>
          </Section>

          <Section title="15. Governing Law">
            <p>
              These Terms are governed by the laws of the jurisdiction from which
              you access the Software, excluding conflicts of law principles.
            </p>
            <p className="mt-3">
              You agree that any dispute shall be resolved in accordance with
              Section 16. Contributors reserve the right to contest jurisdiction
              based on their individual location.
            </p>
            <p className="mt-3 text-xs">
              <Placeholder>
                [DECISION — counsel: consider fixing a single governing law
                instead of &quot;jurisdiction from which you access&quot;]
              </Placeholder>
            </p>
          </Section>

          <Section title="16. Binding Arbitration and Individual Dispute Resolution">
            <p>
              <strong className="text-foreground">16.1 Agreement to Arbitrate.</strong>{" "}
              Any dispute, claim, or controversy arising out of or relating to
              these Terms, the Software, or any interaction with the shielded
              pools, shall be resolved exclusively through binding arbitration.
              You waive any right to bring claims in court or to participate in
              class actions, collective proceedings, or representative actions of
              any kind.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">
                16.2 Identification of Respondent.
              </strong>{" "}
              Because Blizkperse is not a legal entity, you agree to bring any
              claim ONLY against the specific Contributor(s) directly involved in
              the conduct giving rise to the dispute: (a) for disputes related to
              smart contract parameter changes, ownership actions, or
              treasury/fee decisions: the on-chain Ownable owner(s) (or any
              subsequent owners) who authorized such action, as identifiable via
              on-chain transactions — note: as of the Appendix A snapshot this is
              a single EOA, not a multisig or on-chain DAO vote; (b) for disputes
              related to frontends, indexers, or user interfaces: the specific
              operator of the frontend you accessed, as identifiable via domain
              registration or repository commits; (c) for disputes related to core
              protocol code: the Contributors who committed the relevant code to
              the official repositories, as identifiable via Git commit
              signatures; (d) for general disputes not fitting (a)–(c): the Core
              Contributors listed in Appendix B. You may not bring claims against
              Contributors who merely submitted unrelated code, provided informal
              documentation, or participated in community discussions without
              decision-making authority.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">16.3 Venue and Rules.</strong>{" "}
              Arbitration shall be conducted under the rules of{" "}
              <Placeholder>
                [DECISION: ICC / LCIA / UNCITRAL — choose one]
              </Placeholder>
              . The seat of arbitration shall be{" "}
              <Placeholder>
                [DECISION: London / Singapore / Miami — choose one]
              </Placeholder>
              , unless the specific Respondent requests a different seat based on
              their jurisdiction of residence, in which case the Respondent&apos;s
              requested seat shall prevail. The language of arbitration shall be{" "}
              <Placeholder>
                [DECISION: English / Spanish / Portuguese — choose one]
              </Placeholder>
              , unless the Respondent requests a different language in which they
              are more proficient, in which case the Respondent&apos;s requested
              language shall prevail.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Suggested defaults (counsel to confirm): ICC Rules; seat Miami;
              language English — common for LatAm/US crypto projects, but this is
              a founder preference only.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">16.4 Individual Basis Only.</strong>{" "}
              YOU AGREE THAT ANY ARBITRATION WILL BE CONDUCTED ONLY ON AN
              INDIVIDUAL BASIS AND NOT AS A CLASS ACTION, COLLECTIVE ACTION, OR
              REPRESENTATIVE ACTION. You waive any right to participate as a class
              member in any class claim against any Contributor. No arbitration
              may be consolidated with any other proceeding without the consent of
              all parties.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">16.5 Limitation Period.</strong>{" "}
              Any claim must be commenced within one (1) year from the date the
              claim accrues, or such longer period as required by mandatory law in
              the Respondent&apos;s jurisdiction. Failure to commence within this
              period results in permanent bar.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">
                16.6 Governing Law of Arbitration Clause.
              </strong>{" "}
              This Section 16 shall be governed by the law of the seat of
              arbitration, excluding its conflicts of law rules. The arbitrator
              shall have exclusive authority to determine arbitrability and the
              scope of this agreement.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">16.7 Confidentiality.</strong>{" "}
              The existence, content, and results of any arbitration shall be kept
              confidential by the parties, except as required by law or to enforce
              the award.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">16.8 Costs.</strong> Each party
              shall bear its own costs, including legal fees. The arbitrator may
              award costs to the prevailing party if the claim is found frivolous
              or brought in bad faith.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">16.9 Exceptions.</strong>{" "}
              Notwithstanding the above, either party may seek urgent injunctive
              relief in a court of competent jurisdiction to prevent irreparable
              harm pending the appointment of the arbitrator.
            </p>
            <p className="mt-3">
              <strong className="text-foreground">16.10 Covenant Not to Sue.</strong>{" "}
              To the maximum extent permitted by applicable law, you irrevocably
              covenant and agree that you will not bring, initiate, or participate
              in any lawsuit, arbitration, or legal proceeding of any kind against
              any Contributor arising from matters covered by Section 16.2,
              subject to the exceptions in Section 16.9.
            </p>
          </Section>

          <Section title="17. Severability">
            <p>
              If any provision of these Terms is held invalid or unenforceable,
              such provision shall be struck and the remaining provisions enforced
              to the fullest extent permitted by law. Failure to enforce any
              provision shall not constitute a waiver of rights.
            </p>
          </Section>

          <Section title="18. Contact">
            <p>
              There is no central support desk guaranteed for the Software.
              Community discussion channels, if any, are unofficial and create no
              obligation. No Discord or Telegram link appears in the repository
              READMEs as of this draft.
            </p>
            <p className="mt-3">
              Community links:{" "}
              <Placeholder>
                [DECISION: Discord / Telegram / Forum URL — none in repo]
              </Placeholder>
            </p>
            <p className="mt-3">
              For legal notices only:{" "}
              <Placeholder>
                [DECISION: email or postal address — optional]
              </Placeholder>
            </p>
          </Section>

          <Section title="19. Entire Agreement">
            <p>
              These Terms constitute the entire agreement between you and
              Contributors regarding the Software and supersede prior oral or
              written understandings, except as superseded by a written agreement
              signed by an authorized Core Contributor.
            </p>
          </Section>

          <Section title="Appendix A — Deployed Contracts">
            <p className="mb-4 text-xs text-muted-foreground">
              Snapshot of production deployments used by the hosted app (Celo
              chainId {DEPLOYMENTS.celo.chainId}, Monad chainId{" "}
              {DEPLOYMENTS.monad.chainId}, Robinhood Chain chainId{" "}
              {DEPLOYMENTS.robinhood.chainId}), cross-checked with on-chain reads
              on {EFFECTIVE_DATE}. Older legacy pools listed in README /{" "}
              <code className="text-foreground/80">zk/README.md</code> may still
              exist on-chain but are not the multi-token router deployment
              described here.
            </p>

            <h3 className="mb-2 text-sm font-semibold text-foreground">
              Network: Celo (chainId {DEPLOYMENTS.celo.chainId})
            </h3>
            <ul className="mb-4 list-disc space-y-1 pl-5 font-mono text-xs text-muted-foreground">
              <li>
                PoolRouter:{" "}
                <span className="text-foreground/90">{DEPLOYMENTS.celo.router}</span>
              </li>
              {DEPLOYMENTS.celo.pools.map((p) => (
                <li key={p.pool}>
                  ShieldedPool ({p.symbol}):{" "}
                  <span className="text-foreground/90">{p.pool}</span>
                  <span className="block pl-0 sm:pl-4">
                    token: {p.token}
                  </span>
                </li>
              ))}
              <li>
                Transfer / HonkVerifier:{" "}
                <span className="text-foreground/90">
                  {DEPLOYMENTS.celo.transferVerifier}
                </span>
              </li>
              <li>
                WithdrawVerifier:{" "}
                <span className="text-foreground/90">
                  {DEPLOYMENTS.celo.withdrawVerifier}
                </span>
              </li>
              <li>
                DepositVerifier:{" "}
                <span className="text-foreground/90">
                  {DEPLOYMENTS.celo.depositVerifier}
                </span>
              </li>
            </ul>

            <h3 className="mb-2 text-sm font-semibold text-foreground">
              Network: Monad (chainId {DEPLOYMENTS.monad.chainId})
            </h3>
            <ul className="mb-4 list-disc space-y-1 pl-5 font-mono text-xs text-muted-foreground">
              <li>
                PoolRouter:{" "}
                <span className="text-foreground/90">
                  {DEPLOYMENTS.monad.router}
                </span>
              </li>
              {DEPLOYMENTS.monad.pools.map((p) => (
                <li key={p.pool}>
                  ShieldedPool ({p.symbol}):{" "}
                  <span className="text-foreground/90">{p.pool}</span>
                  <span className="block pl-0 sm:pl-4">
                    token: {p.token}
                  </span>
                </li>
              ))}
              <li>
                Transfer / HonkVerifier:{" "}
                <span className="text-foreground/90">
                  {DEPLOYMENTS.monad.transferVerifier}
                </span>
              </li>
              <li>
                WithdrawVerifier:{" "}
                <span className="text-foreground/90">
                  {DEPLOYMENTS.monad.withdrawVerifier}
                </span>
              </li>
              <li>
                DepositVerifier:{" "}
                <span className="text-foreground/90">
                  {DEPLOYMENTS.monad.depositVerifier}
                </span>
              </li>
            </ul>

            <h3 className="mb-2 text-sm font-semibold text-foreground">
              Network: Robinhood Chain (chainId {DEPLOYMENTS.robinhood.chainId})
            </h3>
            <ul className="mb-4 list-disc space-y-1 pl-5 font-mono text-xs text-muted-foreground">
              <li>
                PoolRouter:{" "}
                <span className="text-foreground/90">
                  {DEPLOYMENTS.robinhood.router}
                </span>
              </li>
              {DEPLOYMENTS.robinhood.pools.map((p) => (
                <li key={p.pool}>
                  ShieldedPool ({p.symbol}):{" "}
                  <span className="text-foreground/90">{p.pool}</span>
                  <span className="block pl-0 sm:pl-4">
                    token: {p.token}
                  </span>
                </li>
              ))}
              <li>
                Transfer / HonkVerifier:{" "}
                <span className="text-foreground/90">
                  {DEPLOYMENTS.robinhood.transferVerifier}
                </span>
              </li>
              <li>
                WithdrawVerifier:{" "}
                <span className="text-foreground/90">
                  {DEPLOYMENTS.robinhood.withdrawVerifier}
                </span>
              </li>
              <li>
                DepositVerifier:{" "}
                <span className="text-foreground/90">
                  {DEPLOYMENTS.robinhood.depositVerifier}
                </span>
              </li>
            </ul>

            <h3 className="mb-2 text-sm font-semibold text-foreground">
              Protocol fee &amp; admin (all chains, on-chain)
            </h3>
            <ul className="mb-4 list-disc space-y-1 pl-5 font-mono text-xs text-muted-foreground">
              <li>
                feeBps:{" "}
                <span className="text-foreground/90">{DEPLOYMENTS.feeBps}</span>{" "}
                (0.3%, on top of note amount)
              </li>
              <li>
                treasury:{" "}
                <span className="text-foreground/90">
                  {DEPLOYMENTS.treasuryAndOwner}
                </span>
              </li>
              <li>
                Ownable owner (PoolRouter + pools checked):{" "}
                <span className="text-foreground/90">
                  {DEPLOYMENTS.treasuryAndOwner}
                </span>{" "}
                (EOA; same address currently holds treasury)
              </li>
            </ul>

            <h3 className="mb-2 text-sm font-semibold text-foreground">
              Upgrade / change mechanism
            </h3>
            <p className="mb-4 text-muted-foreground">
              Not a proxy. Contract logic at each address is fixed. Operational
              parameters are Ownable-controlled as described in Section 7
              (setPool / setFeeConfig / setRouter / setRootRegistrar /
              transferOwnership). New circuit versions require new verifier and
              pool deployments. Root registration for claims is performed by the
              authorized <code className="text-foreground/90">rootRegistrar</code>{" "}
              (backend), not by end-user wallets.
            </p>

            <h3 className="mb-2 text-sm font-semibold text-foreground">
              Repository links (monorepo)
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                Monorepo:{" "}
                <a
                  className="underline-offset-4 hover:underline"
                  href={REPO}
                  target="_blank"
                  rel="noreferrer"
                >
                  {REPO}
                </a>
              </li>
              <li>
                Smart contracts:{" "}
                <a
                  className="underline-offset-4 hover:underline"
                  href={REPO_CONTRACTS}
                  target="_blank"
                  rel="noreferrer"
                >
                  {REPO_CONTRACTS}
                </a>
              </li>
              <li>
                Circuits:{" "}
                <a
                  className="underline-offset-4 hover:underline"
                  href={REPO_CIRCUITS}
                  target="_blank"
                  rel="noreferrer"
                >
                  {REPO_CIRCUITS}
                </a>
              </li>
              <li>
                Frontend:{" "}
                <a
                  className="underline-offset-4 hover:underline"
                  href={REPO_FRONTEND}
                  target="_blank"
                  rel="noreferrer"
                >
                  {REPO_FRONTEND}
                </a>
              </li>
            </ul>
          </Section>

          <Section title="Appendix B — Core Contributors">
            <p>
              As of{" "}
              <Placeholder>[DECISION: effective date for this list]</Placeholder>
              , the Core Contributors for purposes of Section 16.2(d) are:
            </p>
            <ol className="mt-3 list-decimal space-y-3 pl-5 text-muted-foreground">
              <li>
                <Placeholder>[DECISION: name or pseudonym]</Placeholder> — Lead
                Smart Contract Architect
                <br />
                Jurisdiction: <Placeholder>[DECISION: country]</Placeholder>
                <br />
                GitHub: <Placeholder>[DECISION: username]</Placeholder>
                <br />
                Multisig / on-chain identifier:{" "}
                <span className="font-mono text-xs text-foreground/80">
                  {DEPLOYMENTS.treasuryAndOwner}
                </span>{" "}
                (current Ownable owner / treasury — optional to list; confirm
                whether this EOA should be attributed to a named Core Contributor)
              </li>
              <li>
                <Placeholder>[DECISION: name or pseudonym]</Placeholder> —
                Protocol Designer &amp; ZK Circuit Lead
                <br />
                Jurisdiction: <Placeholder>[DECISION: country]</Placeholder>
                <br />
                GitHub: <Placeholder>[DECISION: username]</Placeholder>
              </li>
              <li>
                <Placeholder>[DECISION: name or pseudonym]</Placeholder> —
                Frontend &amp; Infrastructure Lead
                <br />
                Jurisdiction: <Placeholder>[DECISION: country]</Placeholder>
                <br />
                GitHub: <Placeholder>[DECISION: username]</Placeholder>
              </li>
            </ol>
            <p className="mt-3">
              Updates to this list shall be made by pull request to{" "}
              <a
                className="underline-offset-4 hover:underline"
                href={REPO}
                target="_blank"
                rel="noreferrer"
              >
                {REPO}
              </a>{" "}
              with 15 days notice. Historical versions remain applicable to
              disputes arising during their effective period.
            </p>
          </Section>
        </article>

        <p className="mt-12 text-center text-xs text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:underline">
            ← Back to Blizkperse
          </Link>
        </p>
      </main>
      <Footer />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-foreground">{title}</h2>
      <div className="text-muted-foreground [&_strong]:font-medium [&_a]:text-foreground/90">
        {children}
      </div>
    </section>
  );
}
