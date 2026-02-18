"use client";

import Link from "next/link";
import Image from "next/image";
import { useAccount, useModal, useLogout } from "@getpara/react-sdk";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogIn, ChevronDown, LayoutDashboard, HandCoins, LogOut } from "lucide-react";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Header() {
  const { isConnected, embedded } = useAccount();
  const { openModal } = useModal();
  const { logout } = useLogout();

  const address = embedded?.wallets?.[0]?.address;

  return (
    <header className="sticky top-0 z-50 glass">
      <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo + Nav */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo.svg"
              alt="Blizkperse"
              width={160}
              height={40}
              className="h-8 w-auto"
              priority
            />
          </Link>

          {isConnected && (
            <nav className="hidden items-center gap-1 md:flex">
              <Link href="/payer">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <LayoutDashboard className="mr-1.5 h-4 w-4" />
                  Organize
                </Button>
              </Link>
              <Link href="/receive">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <HandCoins className="mr-1.5 h-4 w-4" />
                  Receive
                </Button>
              </Link>
            </nav>
          )}
        </div>

        {/* Wallet / Connect */}
        {isConnected && address ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <LogIn className="h-4 w-4" />
                <Badge variant="secondary" className="font-mono text-xs">
                  {truncateAddress(address)}
                </Badge>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <Link href="/payer" className="md:hidden">
                <DropdownMenuItem>
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Organizer Dashboard
                </DropdownMenuItem>
              </Link>
              <Link href="/receive" className="md:hidden">
                <DropdownMenuItem>
                  <HandCoins className="mr-2 h-4 w-4" />
                  Recipient Dashboard
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator className="md:hidden" />
              <DropdownMenuItem
                onClick={() => logout()}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button size="sm" onClick={() => openModal()} className="gap-2">
            <LogIn className="h-4 w-4" />
            Log In
          </Button>
        )}
      </div>
    </header>
  );
}
