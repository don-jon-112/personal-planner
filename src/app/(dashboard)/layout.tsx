import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        {/* Header (Top Nav) */}
        <header className="h-14 bg-white dark:bg-card border-b border-border px-6 flex items-center justify-end shadow-sm z-10">
          <div className="flex items-center gap-4 text-sm font-medium">
            <ThemeToggle />
            <span className="text-muted-foreground">Welcome, <strong className="text-foreground">Jonathan</strong></span>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white">
              JO
            </div>
          </div>
        </header>
        {/* Main Content Area */}
        <div className="p-6 h-full">
          {children}
        </div>
      </main>
    </>
  );
}
