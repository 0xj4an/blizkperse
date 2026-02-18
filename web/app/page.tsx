"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  Upload,
  Landmark,
  HandCoins,
  ShieldCheck,
  Zap,
  CircleDollarSign,
  Lock,
  Github,
  Eye,
  EyeOff,
  Search,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

const steps = [
  {
    icon: Upload,
    title: "Create Payout",
    description: "Select your subscribers, set amounts or split equally. No CSV uploads needed.",
  },
  {
    icon: Landmark,
    title: "Deposit with ZK Proof",
    description: "Funds go into a non-custodial escrow. A ZK proof commits the distribution — amounts stay hidden on-chain.",
  },
  {
    icon: HandCoins,
    title: "Recipients Claim",
    description:
      "Recipients sign in with email or social, get a wallet instantly, and claim — all in seconds.",
  },
];

const features = [
  {
    icon: Lock,
    title: "ZK-Private Distributions",
    description:
      "Zero-knowledge proofs hide individual amounts on-chain. Observers see that a payout happened — but not who got what.",
  },
  {
    icon: ShieldCheck,
    title: "Non-Custodial Escrow",
    description:
      "Funds sit in a smart contract, not a middleman. Only verified recipients can claim their share.",
  },
  {
    icon: Zap,
    title: "Zero Friction Onboarding",
    description:
      "Recipients sign in with email or social — no existing wallet needed. Para creates one instantly.",
  },
  {
    icon: CircleDollarSign,
    title: "Monad Speed, Any Token",
    description:
      "Sub-second finality, negligible gas. Distribute USDC, MON, meme tokens — any ERC-20.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center px-4 pb-24 pt-20 text-center md:pt-32">
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          className="relative z-10 flex max-w-3xl flex-col items-center gap-6"
        >
          <motion.div
            variants={fadeUp}
            custom={0}
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary"
          >
            <Lock className="h-3.5 w-3.5" />
            ZK-Private Payments on Monad
          </motion.div>

          <motion.h1
            variants={fadeUp}
            custom={1}
            className="text-4xl font-bold leading-tight tracking-tight md:text-6xl md:leading-tight"
          >
            Pay On-Chain.{" "}
            <span className="gradient-text">Stay Private.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            custom={2}
            className="max-w-xl text-lg text-muted-foreground md:text-xl"
          >
            On-chain payments are public — anyone can reverse-engineer who got
            paid what. Blizkperse uses zero-knowledge proofs so only the
            recipient knows their amount.
          </motion.p>

          <motion.div variants={fadeUp} custom={3}>
            <Link href="/dashboard">
              <Button size="lg" className="gap-2 text-base">
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* The Problem */}
      <section className="px-4 pb-24">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mb-10 text-center"
          >
            <h2 className="mb-4 text-2xl font-semibold md:text-3xl">
              The Problem
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              Every transaction on a public blockchain is visible. When you
              distribute payments, anyone can see every recipient and every
              amount — making it trivial to reverse-engineer salaries, grants,
              and reward structures.
            </p>
          </motion.div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Eye,
                title: "Fully Transparent",
                description:
                  "Every transfer amount and recipient address is public on the blockchain explorer.",
              },
              {
                icon: Search,
                title: "Easy to Reverse-Engineer",
                description:
                  "Observers can reconstruct your entire payment structure from on-chain data.",
              },
              {
                icon: EyeOff,
                title: "No Confidentiality",
                description:
                  "Recipients can see what everyone else received. Competitive intel leaks freely.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i}
              >
                <Card className="glass h-full border-destructive/20">
                  <CardContent className="flex flex-col gap-3 p-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-4 pb-24">
        <div className="container mx-auto max-w-5xl">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mb-12 text-center text-2xl font-semibold md:text-3xl"
          >
            How It Works
          </motion.h2>
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i}
              >
                <Card className="glass group relative h-full overflow-hidden transition-all hover:glow-purple">
                  <CardContent className="flex flex-col gap-4 p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                      <step.icon className="h-6 w-6" />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <h3 className="text-lg font-semibold">{step.title}</h3>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 pb-24">
        <div className="container mx-auto max-w-5xl">
          <motion.h2
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mb-12 text-center text-2xl font-semibold md:text-3xl"
          >
            Why Blizkperse
          </motion.h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i}
              >
                <Card className="glass group h-full transition-all hover:glow-purple">
                  <CardContent className="flex gap-4 p-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="mb-1 font-semibold">{feature.title}</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-8">
        <div className="container mx-auto flex max-w-5xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <Image
            src="/logo.svg"
            alt="Blizkperse"
            width={120}
            height={30}
            className="h-6 w-auto opacity-60"
          />
          <p className="text-sm text-muted-foreground">
            Made by Blizkperse Team
          </p>
          <a
            href="https://github.com/0xj4an/blizkperse"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
