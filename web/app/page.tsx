"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { ArrowRight, Github } from "lucide-react";

const fadeIn = {
  hidden: { opacity: 0 },
  visible: (i: number) => ({
    opacity: 1,
    transition: { delay: i * 0.12, duration: 0.6, ease: "easeOut" as const },
  }),
};

// prettier-ignore
const ASCII_ART = `
██████╗ ██╗     ██╗███████╗██╗  ██╗
██╔══██╗██║     ██║╚══███╔╝██║ ██╔╝
██████╔╝██║     ██║  ███╔╝ █████╔╝
██╔══██╗██║     ██║ ███╔╝  ██╔═██╗
██████╔╝███████╗██║███████╗██║  ██╗
╚═════╝ ╚══════╝╚═╝╚══════╝╚═╝  ╚═╝
██████╗ ███████╗██████╗ ███████╗███████╗
██╔══██╗██╔════╝██╔══██╗██╔════╝██╔════╝
██████╔╝█████╗  ██████╔╝███████╗█████╗
██╔═══╝ ██╔══╝  ██╔══██╗╚════██║██╔══╝
██║     ███████╗██║  ██║███████║███████╗
╚═╝     ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝`;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="flex flex-col items-center px-4 pb-20 pt-16 md:pt-24">
        <motion.div
          initial="hidden"
          animate="visible"
          className="flex w-full max-w-4xl flex-col items-center"
        >
          <motion.pre
            variants={fadeIn}
            custom={0}
            className="hidden select-none overflow-hidden text-center font-mono text-[0.45rem] leading-[1.1] text-foreground/80 sm:block sm:text-[0.55rem] md:text-xs"
            aria-hidden="true"
          >
            {ASCII_ART}
          </motion.pre>

          <motion.h1
            variants={fadeIn}
            custom={0}
            className="mt-2 text-4xl font-extrabold tracking-tight sm:hidden"
          >
            BLIZKPERSE
          </motion.h1>

          <motion.p
            variants={fadeIn}
            custom={1}
            className="mt-8 max-w-2xl text-center text-lg leading-relaxed text-muted-foreground md:text-xl"
          >
            A zero-knowledge payment layer where your transfers stay
            private, and always on-chain.
          </motion.p>

          <motion.div
            variants={fadeIn}
            custom={2}
            className="mt-8 flex items-center gap-4"
          >
            <Link href="/dashboard">
              <Button
                variant="outline"
                size="lg"
                className="gap-2 border-foreground/20 text-base hover:bg-foreground/5"
              >
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a
              href="https://github.com/0xj4an/blizkperse"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Documentation →
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Divider ─────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl border-t border-foreground/10" />

      {/* ── Problem ─────────────────────────────────────────── */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.h2
              variants={fadeIn}
              custom={0}
              className="mb-6 text-2xl font-semibold md:text-3xl"
            >
              The blockchain made money transparent.
              <br />
              <span className="text-muted-foreground">Too transparent.</span>
            </motion.h2>

            <motion.div
              variants={fadeIn}
              custom={1}
              className="space-y-4 text-base leading-relaxed text-muted-foreground md:text-lg"
            >
              <p>
                Every on-chain transfer is public. When you distribute payments,
                anyone with a block explorer can see exactly who got paid, how
                much, and when. Salaries, grants, rewards - all laid bare.
              </p>
              <p>
                Financial transparency is not financial safety. Your recipients
                deserve the same confidentiality they&apos;d get from a bank
                transfer.
              </p>
              <p className="text-foreground">
                Blizkperse uses zero-knowledge proofs to bring privacy to
                on-chain payments - without compromising auditability.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Divider ─────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl border-t border-foreground/10" />

      {/* ── Explorer Comparison ─────────────────────────────── */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.h2
              variants={fadeIn}
              custom={0}
              className="mb-2 text-2xl font-semibold md:text-3xl"
            >
              What the explorer sees
            </motion.h2>
            <motion.p
              variants={fadeIn}
              custom={1}
              className="mb-10 text-muted-foreground"
            >
              Same three payments. One is public, the other is shielded.
            </motion.p>
          </motion.div>

          <div className="grid gap-px overflow-hidden rounded-lg border border-foreground/10 md:grid-cols-2">
            {/* Public */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
              custom={0}
              className="bg-card"
            >
              <div className="border-b border-foreground/10 px-4 py-3">
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  // public ledger
                </span>
              </div>
              <div className="px-4 py-5 font-mono text-sm leading-loose">
                <div className="text-muted-foreground">
                  transfer(0x7a3b...9f2e → 0x4d1c...8b3a)
                </div>
                <div>
                  amount: <span className="text-red-400">8,500.00 tokens</span>
                </div>
                <div className="my-3 border-t border-foreground/5" />
                <div className="text-muted-foreground">
                  transfer(0x7a3b...9f2e → 0x2e5f...1c7d)
                </div>
                <div>
                  amount: <span className="text-red-400">12,200.00 tokens</span>
                </div>
                <div className="my-3 border-t border-foreground/5" />
                <div className="text-muted-foreground">
                  transfer(0x7a3b...9f2e → 0x9b8a...4e6f)
                </div>
                <div>
                  amount: <span className="text-red-400">6,750.00 tokens</span>
                </div>
              </div>
            </motion.div>

            {/* Shielded */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
              custom={1}
              className="border-t border-foreground/10 bg-card md:border-l md:border-t-0"
            >
              <div className="border-b border-foreground/10 px-4 py-3">
                <span className="font-mono text-xs uppercase tracking-wider text-primary/70">
                  // shielded pool
                </span>
              </div>
              <div className="px-4 py-5 font-mono text-sm leading-loose">
                <div className="text-muted-foreground">
                  deposit(0x085b...00d1 → commitment_0x3f...)
                </div>
                <div>
                  amount: <span className="text-primary/60">██████████</span>
                </div>
                <div className="my-3 border-t border-foreground/5" />
                <div className="text-muted-foreground">
                  deposit(0x085b...00d1 → commitment_0xa1...)
                </div>
                <div>
                  amount: <span className="text-primary/60">██████████</span>
                </div>
                <div className="my-3 border-t border-foreground/5" />
                <div className="text-muted-foreground">
                  deposit(0x085b...00d1 → commitment_0x7e...)
                </div>
                <div>
                  amount: <span className="text-primary/60">██████████</span>
                </div>
              </div>
            </motion.div>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-4 text-sm text-muted-foreground"
          >
            Observers see deposits happened. They can&apos;t see who received
            what.
          </motion.p>
        </div>
      </section>

      {/* ── Divider ─────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl border-t border-foreground/10" />

      {/* ── How It Works ───────────────────────────────────── */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.h2
              variants={fadeIn}
              custom={0}
              className="mb-10 text-2xl font-semibold md:text-3xl"
            >
              How it works
            </motion.h2>

            <div className="space-y-8">
              {[
                {
                  num: "01",
                  title: "Create a payout",
                  text: "Pick recipients and set amounts. No CSV files, no middleware. Just a wallet and a list.",
                },
                {
                  num: "02",
                  title: "Deposit with ZK proof",
                  text: "Funds enter a shielded pool. A zero-knowledge proof commits the distribution while amounts stay invisible on-chain.",
                },
                {
                  num: "03",
                  title: "Recipients claim",
                  text: "Recipients sign in with email or social login. No existing wallet needed. Funds arrive in seconds.",
                },
              ].map((step, i) => (
                <motion.div
                  key={step.num}
                  variants={fadeIn}
                  custom={i + 1}
                  className="flex gap-6"
                >
                  <span className="shrink-0 font-mono text-sm text-muted-foreground/50">
                    {step.num}
                  </span>
                  <div>
                    <h3 className="mb-1 font-semibold">{step.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {step.text}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Divider ─────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl border-t border-foreground/10" />

      {/* ── Use Cases ──────────────────────────────────────── */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.h2
              variants={fadeIn}
              custom={0}
              className="mb-2 text-2xl font-semibold md:text-3xl"
            >
              Real use cases
            </motion.h2>
            <motion.p
              variants={fadeIn}
              custom={1}
              className="mb-10 text-muted-foreground"
            >
              Not evasion. Not secrecy. Just the same confidentiality you expect
              from a bank - on-chain.
            </motion.p>

            <div className="grid gap-px overflow-hidden rounded-lg border border-foreground/10 sm:grid-cols-2">
              {[
                {
                  title: "Payroll & contractors",
                  text: "Pay your team without publishing every salary to the blockchain.",
                },
                {
                  title: "Grants & bounties",
                  text: "Distribute funding without revealing individual award amounts.",
                },
                {
                  title: "Rewards & airdrops",
                  text: "Send tokens without letting recipients compare amounts.",
                },
                {
                  title: "DAO treasury",
                  text: "Execute distributions without leaking allocation decisions.",
                },
              ].map((uc, i) => (
                <motion.div
                  key={uc.title}
                  variants={fadeIn}
                  custom={i + 2}
                  className="bg-card p-6"
                >
                  <h3 className="mb-1 text-sm font-semibold">{uc.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {uc.text}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Divider ─────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl border-t border-foreground/10" />

      {/* ── Tech ───────────────────────────────────────────── */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.h2
              variants={fadeIn}
              custom={0}
              className="mb-10 text-2xl font-semibold md:text-3xl"
            >
              Under the hood
            </motion.h2>

            <div className="space-y-6">
              {[
                {
                  label: "Zero-knowledge privacy",
                  text: "Noir circuits generate proofs client-side. Amounts are committed as Poseidon2 hashes. Nobody - not even the contract - sees plaintext values.",
                },
                {
                  label: "Non-custodial by design",
                  text: "Funds sit in an auditable smart contract, not a multisig or a mixer. Only verified recipients can withdraw their share.",
                },
                {
                  label: "Monad-native speed",
                  text: "Sub-second finality. Negligible gas. Distribute any ERC-20 - USDC, MON, or any token - at the speed the chain was built for.",
                },
                {
                  label: "Zero friction onboarding",
                  text: "Recipients sign in with email or social login and get an embedded wallet instantly. No MetaMask. No seed phrases.",
                },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  variants={fadeIn}
                  custom={i + 1}
                  className="border-l-2 border-foreground/10 pl-6"
                >
                  <h3 className="mb-1 text-sm font-semibold">{item.label}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.text}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Divider ─────────────────────────────────────────── */}
      <div className="mx-auto max-w-4xl border-t border-foreground/10" />

      {/* ── CTA ────────────────────────────────────────────── */}
      <section className="px-4 py-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-center"
        >
          <motion.p
            variants={fadeIn}
            custom={0}
            className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground"
          >
            Live on Monad
          </motion.p>
          <motion.h2
            variants={fadeIn}
            custom={1}
            className="mb-4 text-3xl font-bold md:text-4xl"
          >
            Ready to pay privately?
          </motion.h2>
          <motion.p
            variants={fadeIn}
            custom={2}
            className="mb-8 text-muted-foreground"
          >
            Start distributing tokens with zero-knowledge privacy.
            <br />
            No setup fees. No KYC for recipients.
          </motion.p>
          <motion.div
            variants={fadeIn}
            custom={3}
            className="flex items-center justify-center gap-4"
          >
            <Link href="/dashboard">
              <Button
                variant="outline"
                size="lg"
                className="gap-2 border-foreground/20 text-base hover:bg-foreground/5"
              >
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a
              href="https://github.com/0xj4an/blizkperse"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              View source →
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-foreground/10 px-4 py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <Image
            src="/logo.svg"
            alt="Blizkperse"
            width={120}
            height={30}
            className="h-5 w-auto opacity-40"
          />
          <p className="font-mono text-xs text-muted-foreground/60">
            Privacy you can prove.
          </p>
          <a
            href="https://github.com/0xj4an/blizkperse"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <Github className="h-3.5 w-3.5" />
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
