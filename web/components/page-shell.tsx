import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export function PageShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="container mx-auto max-w-2xl flex-1 px-4 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-2 text-muted-foreground">{description}</p>
          )}
        </div>
        {children}
      </main>
      <Footer />
    </div>
  );
}
