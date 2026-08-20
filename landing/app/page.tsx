"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Github,
  Shield,
  Lock,
  Globe,
  Users,
  Zap,
  Eye,
  EyeOff,
  Coins,
  Wallet,
  Key,
  CircleDollarSign,
  Fuel,
  Fingerprint,
  Check,
} from "lucide-react";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.blizkperse.com";

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

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

const STATS = [
  { value: "3", label: "chains live" },
  { value: "100%", label: "on-chain" },
  { value: "0", label: "gas for claims" },
  { value: "OSS", label: "open source" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ───────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo.svg"
              alt="Blizkperse"
              width={24}
              height={24}
              className="h-5 w-5"
            />
            <span className="font-mono text-sm font-semibold tracking-tight">
              blizkperse
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/0xj4an/blizkperse"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Github className="h-4 w-4" />
            </a>
            <a href={APP_URL}>
              <Button size="sm" className="gap-1.5">
                Launch App
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="flex flex-col items-center px-4 pb-16 pt-20 md:pt-28">
        <motion.div
          initial="hidden"
          animate="visible"
          className="flex w-full max-w-4xl flex-col items-center"
        >
          <motion.pre
            variants={fadeIn}
            custom={0}
            className="glow-hero hidden select-none overflow-hidden text-center font-mono text-[0.45rem] leading-[1.1] text-foreground/50 sm:block sm:text-[0.55rem] md:text-xs"
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
            className="mt-10 max-w-2xl text-center text-lg leading-relaxed text-muted-foreground md:text-xl"
          >
            Send stablecoins privately. No exposed wallets. No leaked amounts.
            <br className="hidden sm:block" />
            Just zero-knowledge math on-chain.
          </motion.p>

          <motion.div
            variants={fadeIn}
            custom={2}
            className="mt-10 flex items-center gap-4"
          >
            <a href={APP_URL}>
              <Button size="lg" className="gap-2 text-base">
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
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

      {/* ── Stats Strip ──────────────────────────────────── */}
      <section className="border-y border-border/50 px-4 py-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mx-auto flex max-w-3xl items-center justify-between gap-6"
        >
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              variants={fadeIn}
              custom={i}
              className="flex flex-col items-center gap-1 text-center"
            >
              <span className="font-mono text-xl font-bold tracking-tight md:text-2xl">
                {stat.value}
              </span>
              <span className="text-[0.65rem] uppercase tracking-widest text-muted-foreground md:text-xs">
                {stat.label}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Explorer Comparison ───────────────────────────── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-4xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
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

          <div className="grid gap-px overflow-hidden rounded-lg border border-border/50 md:grid-cols-2">
            {/* Public */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeIn}
              custom={0}
              className="bg-card"
            >
              <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
                <Eye className="h-3.5 w-3.5 text-muted-foreground/50" />
                <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  public ledger
                </span>
              </div>
              <div className="px-4 py-5 font-mono text-sm leading-loose">
                <div className="text-muted-foreground">
                  transfer(0x7a3b...9f2e → 0x4d1c...8b3a)
                </div>
                <div>
                  amount:{" "}
                  <span className="text-destructive">8,500.00 USDC</span>
                </div>
                <div className="my-3 border-t border-border/30" />
                <div className="text-muted-foreground">
                  transfer(0x7a3b...9f2e → 0x2e5f...1c7d)
                </div>
                <div>
                  amount:{" "}
                  <span className="text-destructive">12,200.00 USDC</span>
                </div>
                <div className="my-3 border-t border-border/30" />
                <div className="text-muted-foreground">
                  transfer(0x7a3b...9f2e → 0x9b8a...4e6f)
                </div>
                <div>
                  amount:{" "}
                  <span className="text-destructive">6,750.00 USDC</span>
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
              className="border-t border-border/50 bg-card md:border-l md:border-t-0"
            >
              <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
                <EyeOff className="h-3.5 w-3.5 text-foreground/40" />
                <span className="font-mono text-xs uppercase tracking-wider text-foreground/40">
                  shielded pool
                </span>
              </div>
              <div className="px-4 py-5 font-mono text-sm leading-loose">
                <div className="text-muted-foreground">
                  deposit(0x085b...00d1 → commitment_0x3f...)
                </div>
                <div>
                  amount:{" "}
                  <span className="text-foreground/20">██████████</span>
                </div>
                <div className="my-3 border-t border-border/30" />
                <div className="text-muted-foreground">
                  deposit(0x085b...00d1 → commitment_0xa1...)
                </div>
                <div>
                  amount:{" "}
                  <span className="text-foreground/20">██████████</span>
                </div>
                <div className="my-3 border-t border-border/30" />
                <div className="text-muted-foreground">
                  deposit(0x085b...00d1 → commitment_0x7e...)
                </div>
                <div>
                  amount:{" "}
                  <span className="text-foreground/20">██████████</span>
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

      <div className="mx-auto max-w-4xl border-t border-border/50" />

      {/* ── Problem (condensed) ──────────────────────────── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
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

            <motion.p
              variants={fadeIn}
              custom={1}
              className="text-base leading-relaxed text-muted-foreground md:text-lg"
            >
              Every on-chain transfer is public. Salaries, grants, rewards, all
              visible to anyone with a block explorer. Your recipients deserve
              the same confidentiality they&apos;d get from a bank transfer.{" "}
              <span className="text-foreground">
                Blizkperse uses zero-knowledge proofs to fix that.
              </span>
            </motion.p>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-4xl border-t border-border/50" />

      {/* ── How It Works ──────────────────────────────────── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            <motion.h2
              variants={fadeIn}
              custom={0}
              className="mb-12 text-2xl font-semibold md:text-3xl"
            >
              How it works
            </motion.h2>

            <div className="space-y-10">
              {[
                {
                  num: "01",
                  title: "Create a payout",
                  text: "Pick recipients and set amounts. No CSV files, no middleware. Just a wallet and a list.",
                  icon: Users,
                },
                {
                  num: "02",
                  title: "Deposit with ZK proof",
                  text: "Funds enter a shielded pool. A zero-knowledge proof commits the distribution while amounts stay invisible on-chain.",
                  icon: Shield,
                },
                {
                  num: "03",
                  title: "Recipients claim",
                  text: "Recipients sign in with email or social login. No existing wallet needed. Funds arrive in seconds.",
                  icon: Zap,
                },
              ].map((step, i) => (
                <motion.div
                  key={step.num}
                  variants={fadeIn}
                  custom={i + 1}
                  className="flex gap-6"
                >
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-card">
                      <step.icon className="h-4 w-4 text-foreground/60" />
                    </div>
                    {i < 2 && (
                      <div className="mt-2 h-full w-px bg-border/30" />
                    )}
                  </div>
                  <div className="pb-2">
                    <span className="font-mono text-xs text-muted-foreground/40">
                      {step.num}
                    </span>
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

      <div className="mx-auto max-w-4xl border-t border-border/50" />

      {/* ── Features ──────────────────────────────────────── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-4xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            <motion.h2
              variants={fadeIn}
              custom={0}
              className="mb-12 text-2xl font-semibold md:text-3xl"
            >
              Under the hood
            </motion.h2>

            <div className="grid gap-px overflow-hidden rounded-lg border border-border/50 sm:grid-cols-2">
              {[
                {
                  icon: Lock,
                  title: "Zero-knowledge privacy",
                  text: "Noir circuits generate proofs client-side. Amounts are committed as Poseidon2 hashes. Nobody, not even the contract, sees plaintext values.",
                },
                {
                  icon: Shield,
                  title: "Non-custodial by design",
                  text: "Funds sit in an auditable smart contract, not a multisig or a mixer. Only verified recipients can withdraw their share.",
                },
                {
                  icon: Globe,
                  title: "Multi-chain deployment",
                  text: "Deploy on any EVM chain. Currently live on Monad, Celo, and Robinhood Chain, with the same shielded pool architecture and proof system on every network.",
                },
                {
                  icon: Zap,
                  title: "Zero friction onboarding",
                  text: "Recipients sign in with email or social login and get an embedded wallet instantly. No MetaMask. No seed phrases.",
                },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  variants={fadeIn}
                  custom={i + 1}
                  className="bg-card p-6"
                >
                  <item.icon className="mb-3 h-5 w-5 text-foreground/40" />
                  <h3 className="mb-2 text-sm font-semibold">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.text}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-4xl border-t border-border/50" />

      {/* ── Use Cases (trimmed to 3) ─────────────────────── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
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
              The same confidentiality you expect from a bank, but on-chain.
            </motion.p>

            <div className="space-y-4">
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
                  title: "Agent payments (x402)",
                  text: "AI agents pay for API access using shielded stablecoin transfers. No exposed wallets, no trackable spending patterns.",
                },
              ].map((uc, i) => (
                <motion.div
                  key={uc.title}
                  variants={fadeIn}
                  custom={i + 2}
                  className="border-l-2 border-border/50 pl-6"
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

      <div className="mx-auto max-w-4xl border-t border-border/50" />

      {/* ── Built On ─────────────────────────────────────── */}
      <section className="px-4 py-12">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mx-auto max-w-3xl"
        >
          <motion.p
            variants={fadeIn}
            custom={0}
            className="mb-6 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground/60"
          >
            Built on
          </motion.p>
          <motion.div
            variants={fadeIn}
            custom={1}
            className="flex items-center justify-center gap-10 md:gap-16"
          >
            {[
              { name: "Noir", desc: "ZK circuits" },
              { name: "Monad", desc: "EVM L1" },
              { name: "Celo", desc: "EVM L1" },
              { name: "Robinhood", desc: "EVM chain" },
            ].map((tech) => (
              <div
                key={tech.name}
                className="flex flex-col items-center gap-1.5"
              >
                <span className="font-mono text-sm font-semibold tracking-tight text-foreground/70">
                  {tech.name}
                </span>
                <span className="text-[0.6rem] uppercase tracking-widest text-muted-foreground/40">
                  {tech.desc}
                </span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      <div className="mx-auto max-w-4xl border-t border-border/50" />

      {/* ── Partners ─────────────────────────────────────── */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            <motion.p
              variants={fadeIn}
              custom={0}
              className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground"
            >
              Trusted by
            </motion.p>
            <motion.h2
              variants={fadeIn}
              custom={1}
              className="mb-10 text-2xl font-semibold md:text-3xl"
            >
              Projects using Blizkperse
            </motion.h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* TuCOP */}
              <motion.a
                href="https://tucop.xyz/"
                target="_blank"
                rel="noopener noreferrer"
                variants={fadeIn}
                custom={3}
                className="group rounded-lg border border-border/50 bg-card p-6 transition-all hover:border-foreground/20 hover:shadow-lg"
              >
                <Image
                  src="/partners/tucop-color.png"
                  alt="TuCOP"
                  width={160}
                  height={40}
                  className="mb-4 h-8 w-auto opacity-50 grayscale transition-all group-hover:opacity-80 group-hover:grayscale-0"
                />
                <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                  Digital wallet for saving and managing money in pesos and dollars, with fast transfers and on-chain rails.
                </p>
                <span className="text-xs text-muted-foreground/60 transition-colors group-hover:text-foreground/60">
                  tucop.xyz &rarr;
                </span>
              </motion.a>

              {/* Celo Colombia */}
              <motion.a
                href="https://www.celocolombia.org/"
                target="_blank"
                rel="noopener noreferrer"
                variants={fadeIn}
                custom={4}
                className="group rounded-lg border border-border/50 bg-card p-6 transition-all hover:border-foreground/20 hover:shadow-lg"
              >
                <Image
                  src="/partners/celocolombia.png"
                  alt="Celo Colombia"
                  width={200}
                  height={54}
                  className="mb-4 h-8 w-auto opacity-50 grayscale transition-all group-hover:opacity-80 group-hover:grayscale-0"
                />
                <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                  Supporting entrepreneurs and builders in Colombia&apos;s Celo ecosystem with resources and community.
                </p>
                <span className="text-xs text-muted-foreground/60 transition-colors group-hover:text-foreground/60">
                  celocolombia.org &rarr;
                </span>
              </motion.a>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-4xl border-t border-border/50" />

      {/* ── Roadmap ─────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 py-24">
        {/* Subtle background glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[600px] w-[800px] rounded-full bg-foreground/[0.02] blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-5xl">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            <motion.p
              variants={fadeIn}
              custom={0}
              className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground"
            >
              What&apos;s next
            </motion.p>
            <motion.h2
              variants={fadeIn}
              custom={1}
              className="mb-4 text-2xl font-semibold md:text-3xl"
            >
              Building in public
            </motion.h2>
            <motion.p
              variants={fadeIn}
              custom={2}
              className="mb-14 max-w-xl text-muted-foreground"
            >
              Blizkperse is live today. Here&apos;s the path from private payments to a full financial privacy layer.
            </motion.p>

            {/* ── Phase headers (horizontal progress) ──── */}
            <motion.div
              variants={fadeIn}
              custom={3}
              className="mb-10 flex items-center gap-0"
            >
              {[
                { label: "Now", active: true },
                { label: "Next", active: false },
                { label: "Later", active: false },
              ].map((phase, i) => (
                <div key={phase.label} className="flex flex-1 items-center">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-bold ${
                        phase.active
                          ? "bg-foreground text-background"
                          : "border border-border/80 text-muted-foreground"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <span
                      className={`font-mono text-xs uppercase tracking-widest ${
                        phase.active ? "text-foreground" : "text-muted-foreground/60"
                      }`}
                    >
                      {phase.label}
                    </span>
                  </div>
                  {i < 2 && (
                    <div className="mx-4 h-px flex-1 bg-border/40" />
                  )}
                </div>
              ))}
            </motion.div>

            {/* ── Phase 1: NOW ─────────────────────────── */}
            <motion.div variants={fadeIn} custom={4} className="mb-8">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.03] p-6 md:p-8">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400">
                    <Check className="h-3 w-3 text-background" />
                  </div>
                  <span className="font-mono text-xs uppercase tracking-widest text-emerald-400">
                    Live on mainnet
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {[
                    {
                      icon: Shield,
                      label: "Private payouts",
                      desc: "ZK-shielded on Monad, Celo & Robinhood",
                    },
                    {
                      icon: Coins,
                      label: "Multi-token pools",
                      desc: "COPm, USDT, USDC, USDG & more — pool per token",
                    },
                    {
                      icon: CircleDollarSign,
                      label: "Arbitrary amounts",
                      desc: "Any note size, not fixed denominations",
                    },
                    {
                      icon: Lock,
                      label: "On-chain proofs",
                      desc: "Noir circuits + Honk verifiers",
                    },
                    {
                      icon: Users,
                      label: "Social login",
                      desc: "Email or Google, instant wallet",
                    },
                    {
                      icon: Fuel,
                      label: "Gasless claims",
                      desc: "Sponsored withdrawals — recipients need no gas",
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex gap-3">
                      <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/60" />
                      <div>
                        <p className="text-sm font-medium text-foreground/90">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* ── Phase 2: NEXT ────────────────────────── */}
            <motion.div variants={fadeIn} custom={5} className="mb-8">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground/60" />
                <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  In development
                </span>
              </div>
              <div className="grid gap-px overflow-hidden rounded-xl border border-border/50 sm:grid-cols-3">
                {[
                  {
                    icon: Lock,
                    title: "Hardened core",
                    items: ["Security audit", "Stronger root trust model", "Formal verification"],
                  },
                  {
                    icon: Wallet,
                    title: "Treasury access",
                    items: ["Safe multisig", "Multi-approver flows", "Org spending policies"],
                  },
                  {
                    icon: Key,
                    title: "Open API",
                    items: ["REST endpoints", "Webhooks", "Keys for agents & partners"],
                  },
                ].map((card) => (
                  <div key={card.title} className="bg-card p-5 md:p-6">
                    <card.icon className="mb-3 h-4 w-4 text-foreground/40" />
                    <h3 className="mb-3 text-sm font-semibold">{card.title}</h3>
                    <ul className="space-y-1.5">
                      {card.items.map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <span className="h-px w-2.5 bg-border" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* ── Phase 3: LATER ───────────────────────── */}
            <motion.div variants={fadeIn} custom={6}>
              <div className="mb-4 flex items-center gap-2.5">
                <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground/50">
                  On the horizon
                </span>
              </div>
              <div className="grid gap-px overflow-hidden rounded-xl border border-border/30 sm:grid-cols-3">
                {[
                  {
                    icon: Fingerprint,
                    title: "Identity layer",
                    desc: "Pluggable KYC with Self Protocol & vlayer for LATAM",
                  },
                  {
                    icon: CircleDollarSign,
                    title: "FHE research",
                    desc: "Exploring fully homomorphic encryption for enhanced confidentiality",
                  },
                  {
                    icon: Globe,
                    title: "More networks",
                    desc: "Expand shielded payouts across additional EVM ecosystems",
                  },
                ].map((card) => (
                  <div key={card.title} className="bg-card/50 p-5">
                    <card.icon className="mb-2.5 h-4 w-4 text-foreground/20" />
                    <h3 className="mb-1.5 text-sm font-semibold text-foreground/60">{card.title}</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground/60">{card.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-4xl border-t border-border/50" />

      {/* ── CTA ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 py-24">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[400px] w-[600px] rounded-full bg-foreground/[0.03] blur-[100px]" />
        </div>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="relative mx-auto max-w-3xl text-center"
        >
          <motion.p
            variants={fadeIn}
            custom={0}
            className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground"
          >
            Privacy you can prove
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
            className="mb-10 text-muted-foreground"
          >
            Start distributing stablecoins with zero-knowledge privacy.
            <br />
            No setup fees. No KYC for recipients.
          </motion.p>
          <motion.div
            variants={fadeIn}
            custom={3}
            className="flex items-center justify-center gap-4"
          >
            <a href={APP_URL}>
              <Button size="lg" className="gap-2 text-base">
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
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

      {/* ── Footer ────────────────────────────────────────── */}
      <footer className="border-t border-border/50 px-4 py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Blizkperse"
              width={80}
              height={20}
              className="h-4 w-auto opacity-40"
            />
          </div>
          <p className="font-mono text-xs text-muted-foreground/60">
            Privacy you can prove.
          </p>
          <div className="flex items-center gap-4">
            <a
              href={`${APP_URL}/terms`}
              className="text-sm text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              Terms
            </a>
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
        </div>
      </footer>
    </div>
  );
}
