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
      <main className="container mx-auto max-w-6xl flex-1 px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{title}</h1>
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
