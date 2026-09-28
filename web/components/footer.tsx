import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-foreground/10">
      <div className="container mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 py-6">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Blizkperse. Experimental software.
        </p>
        <nav className="flex items-center gap-4 text-xs text-muted-foreground">
          <Link
            href="/terms"
            className="transition-colors hover:text-foreground"
          >
            Terms &amp; Conditions
          </Link>
        </nav>
      </div>
    </footer>
  );
}
