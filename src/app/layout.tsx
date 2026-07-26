import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/sidebar";
import { QueryProvider } from "@/components/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Personal Planner Web",
  description: "Dashboard for tracking weekly reports, todos, and notes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex bg-background text-foreground">
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            disableTransitionOnChange
          >
            <TooltipProvider>
              <Sidebar />
              <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
                {/* Header (Top Nav) */}
                <header className="h-14 bg-white border-b border-border px-6 flex items-center justify-end shadow-sm z-10">
                  <div className="flex items-center gap-4 text-sm font-medium">
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
            </TooltipProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
