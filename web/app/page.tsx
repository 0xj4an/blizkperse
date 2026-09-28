"use client";

import Link from "next/link";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { HandCoins, Send } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="container mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">What do you want to do?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick a network in the header. The color follows that network.
        </p>
        <div className="mt-8 grid gap-3">
          <Link
            href="/receive"
            className="rounded-2xl border border-primary/40 bg-primary/10 p-5 transition-colors hover:bg-primary/15"
          >
            <HandCoins className="h-5 w-5 text-primary" />
            <p className="mt-3 text-lg font-semibold">Get paid</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a link, or see what is already yours.
            </p>
          </Link>
          <Link
            href="/payer"
            className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/20"
          >
            <Send className="h-5 w-5 text-primary" />
            <p className="mt-3 text-lg font-semibold">Send</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Pay the people in your group.
            </p>
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
