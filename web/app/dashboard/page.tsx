"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Header } from "@/components/header";
import { AuthGuard } from "@/components/auth-guard";
import { Card, CardContent } from "@/components/ui/card";
import { LayoutDashboard, HandCoins, ArrowRight } from "lucide-react";

const roles = [
  {
    href: "/payer",
    icon: LayoutDashboard,
    title: "Pay",
    description: "Distribute stablecoin rewards to your participants.",
  },
  {
    href: "/receive",
    icon: HandCoins,
    title: "Receive",
    description: "Browse payers, register, and claim your payments.",
  },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AuthGuard>
        <main className="container mx-auto flex max-w-2xl flex-col items-center px-4 py-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10 text-center"
          >
            <h1 className="text-3xl font-bold gradient-text">
              What would you like to do?
            </h1>
            <p className="mt-2 text-muted-foreground">
              Choose how you want to use Blizkperse
            </p>
          </motion.div>

          <div className="grid w-full gap-4 sm:grid-cols-2">
            {roles.map((role, i) => (
              <motion.div
                key={role.href}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.1, duration: 0.4 }}
              >
                <Link href={role.href}>
                  <Card className="glass group h-full cursor-pointer transition-all hover:glow-purple hover:border-primary/30">
                    <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                        <role.icon className="h-8 w-8" />
                      </div>
                      <h2 className="text-xl font-semibold">{role.title}</h2>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {role.description}
                      </p>
                      <div className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                        Continue
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        </main>
      </AuthGuard>
    </div>
  );
}
