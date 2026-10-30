"use client";

import { useState, useEffect } from "react";
import { 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  RefreshCw, 
  HelpCircle, 
  UploadCloud, 
  ChevronDown, 
  ChevronUp, 
  Flame, 
  Globe,
  Zap,
  Server
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useConfirm, useAlertModal } from "@/components/confirm-dialog-provider";
import { 
  DatabaseProviderType, 
  getActiveDatabaseProvider, 
  setActiveDatabaseProvider, 
  getCustomPostgresUrl, 
  saveCustomPostgresUrl, 
  resetToDefaultFirebase
} from "@/lib/db-config";
import { 
  testPostgresConnection, 
  fetchAllActiveFirestoreData, 
  triggerSafetyBackupDownload, 
  migrateToPostgres,
  MigrationProgress
} from "@/lib/database-migration";

export function DatabaseProviderSection() {
  const confirm = useConfirm();
  const alertModal = useAlertModal();

  const [activeProvider, setActiveProvider] = useState<DatabaseProviderType>("firebase");
  const [selectedProvider, setSelectedProvider] = useState<DatabaseProviderType>("firebase");

  // PostgreSQL Connection String state
  const [dbUrl, setDbUrl] = useState("");

  // Vercel Server Integration state
  const [vercelConfigured, setVercelConfigured] = useState<boolean | null>(null);
  const [vercelToken, setVercelToken] = useState("");
  const [vercelProjectId, setVercelProjectId] = useState("");
  const [showVercelManualInput, setShowVercelManualInput] = useState(false);
  const [isUpdatingVercel, setIsUpdatingVercel] = useState(false);

  // Status & Progress state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; error?: string; message?: string } | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);

  // Guide toggles
  const [activeGuideTab, setActiveGuideTab] = useState<"supabase" | "other" | "vercel">("supabase");
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);

  // Initialize from storage on mount
  useEffect(() => {
    const current = getActiveDatabaseProvider();
    setActiveProvider(current);
    setSelectedProvider(current);

    const customUrl = getCustomPostgresUrl();
    if (customUrl) {
      setDbUrl(customUrl);
    }

    // Check if VERCEL_ACCESS_TOKEN is configured in server environment
    fetch("/api/vercel/update-env")
      .then((res) => res.json())
      .then((data) => {
        setVercelConfigured(Boolean(data?.configured));
        if (!data?.configured) {
          setShowVercelManualInput(true);
        }
      })
      .catch(() => {
        setVercelConfigured(false);
        setShowVercelManualInput(true);
      });
  }, []);

  // 1. Test PostgreSQL Connection
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      if (selectedProvider === "firebase") {
        setTestResult({
          success: true,
          message: "Firebase Bawaan aktif dan terhubung via Environment Variables Vercel.",
        });
      } else if (selectedProvider === "postgres") {
        const res = await testPostgresConnection(dbUrl.trim());
        setTestResult({
          success: res.success,
          error: res.error,
          message: res.success ? "Koneksi ke PostgreSQL Berhasil! Tabel app_documents dan index otomatis dibuat & siap digunakan." : undefined,
        });
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err?.message || "Terjadi kesalahan saat pengujian koneksi." });
    } finally {
      setIsTesting(false);
    }
  };

  // 2. Start Data Migration (Firebase -> PostgreSQL)
  const handleStartMigration = async () => {
    if (selectedProvider === "firebase") {
      await alertModal({
        title: "Database Sudah Firebase",
        description: "Database yang Anda pilih adalah Firebase bawaan saat ini. Fitur migrasi digunakan untuk memindahkan data ke PostgreSQL / Supabase.",
        variant: "info",
      });
      return;
    }

    if (!dbUrl || !dbUrl.trim()) {
      await alertModal({
        title: "Connection String Belum Diisi",
        description: "Silakan masukkan PostgreSQL Connection String terlebih dahulu.",
        variant: "error",
      });
      return;
    }

    const ok = await confirm({
      title: "Migrasi Data dari Firebase ke PostgreSQL?",
      description: "Sistem akan mengambil seluruh data dari Firebase saat ini, mengunduh file cadangan otomatis (.json) ke komputer Anda untuk keamanan, membuat tabel app_documents otomatis di PostgreSQL target, lalu menyalin seluruh dokumen ke database target. Apakah Anda ingin melanjutkan?",
      confirmText: "Ya, Mulai Migrasi",
      cancelText: "Batal",
      variant: "primary",
    });

    if (!ok) return;

    setIsMigrating(true);
    setMigrationProgress(null);

    try {
      // Step A: Tarik seluruh data dari Firestore aktif
      setMigrationProgress({
        currentCollection: "Membaca Database",
        collectionIndex: 0,
        totalCollections: 15,
        currentItems: 0,
        totalItems: 0,
        percentage: 5,
        statusText: "Membaca seluruh dokumen dari Firebase...",
      });

      const allData = await fetchAllActiveFirestoreData();

      // Step B: Unduh Safety Backup
      triggerSafetyBackupDownload(allData);

      // Step C: Eksekusi migrasi ke PostgreSQL via API
      const result = await migrateToPostgres(dbUrl.trim(), allData, (prog) => {
        setMigrationProgress(prog);
      });
      saveCustomPostgresUrl(dbUrl.trim());

      // Step D: Konfirmasi beralih database
      const switchNow = await confirm({
        title: "Migrasi Berhasil 100%!",
        description: `Berhasil menyalin ${result.totalMigrated} dokumen ke PostgreSQL target! Apakah Anda ingin langsung mengaktifkan PostgreSQL sebagai database aktif sekarang?`,
        confirmText: "Aktifkan Sekarang (Reload)",
        cancelText: "Nanti Saja",
        variant: "default",
      });

      if (switchNow) {
        setActiveDatabaseProvider("postgres");
        window.location.reload();
      }
    } catch (err: any) {
      console.error("Migration error:", err);
      await alertModal({
        title: "Migrasi Gagal",
        description: err?.message || "Terjadi kesalahan saat proses migrasi data ke PostgreSQL.",
        variant: "error",
      });
    } finally {
      setIsMigrating(false);
    }
  };

  // 3. Save & Activate (Client-side)
  const handleSaveAndActivate = async () => {
    if (selectedProvider === "firebase") {
      resetToDefaultFirebase();
      setActiveProvider("firebase");
      await alertModal({
        title: "Beralih ke Firebase Bawaan",
        description: "Aplikasi sekarang menggunakan database Firebase bawaan dari Vercel ENV.",
        variant: "success",
      });
      window.location.reload();
      return;
    }

    if (selectedProvider === "postgres") {
      if (!dbUrl || !dbUrl.trim()) {
        await alertModal({
          title: "Connection String Belum Diisi",
          description: "PostgreSQL Connection String wajib diisi.",
          variant: "error",
        });
        return;
      }
      saveCustomPostgresUrl(dbUrl.trim());
      setActiveDatabaseProvider("postgres");
      setActiveProvider("postgres");
    }

    await alertModal({
      title: "Database Diaktifkan!",
      description: "Pengaturan database telah disimpan di browser Anda. Halaman akan dimuat ulang.",
      variant: "success",
    });
    window.location.reload();
  };

  // 4. Update to Vercel via API & Trigger Redeploy
  const handleUpdateVercel = async () => {
    if (selectedProvider === "postgres" && (!dbUrl || !dbUrl.trim())) {
      await alertModal({
        title: "Connection String Belum Diisi",
        description: "PostgreSQL Connection String wajib diisi sebelum di-push ke Vercel.",
        variant: "error",
      });
      return;
    }

    const ok = await confirm({
      title: "Push Konfigurasi ke Vercel?",
      description: `Sistem akan otomatis memperbarui Environment Variables di Vercel menjadi ${selectedProvider === "postgres" ? "PostgreSQL / Supabase" : "Firebase Bawaan"} dan memicu Redeploy otomatis di akun Vercel Anda. Lanjutkan?`,
      confirmText: "Ya, Push & Redeploy",
      cancelText: "Batal",
      variant: "primary",
    });

    if (!ok) return;

    setIsUpdatingVercel(true);
    try {
      const envList = selectedProvider === "postgres"
        ? [
            { key: "NEXT_PUBLIC_DB_PROVIDER", value: "postgres" },
            { key: "DATABASE_URL", value: dbUrl.trim() },
          ]
        : [
            { key: "NEXT_PUBLIC_DB_PROVIDER", value: "firebase" },
          ];

      const res = await fetch("/api/vercel/update-env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vercelToken: vercelToken.trim() || undefined,
          projectId: vercelProjectId.trim() || undefined,
          envs: envList,
          triggerDeploy: true,
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (selectedProvider === "postgres") {
          saveCustomPostgresUrl(dbUrl.trim());
          setActiveDatabaseProvider("postgres");
        } else {
          resetToDefaultFirebase();
        }

        if (data.deployed) {
          await alertModal({
            title: "Vercel Berhasil Diperbarui & Redeploy Berjalan!",
            description: "DATABASE_URL berhasil diperbarui di Vercel dan build/redeploy ulang otomatis sedang berjalan (~1 menit). Halaman akan segera menggunakan database baru.",
            variant: "success",
          });
        } else {
          await alertModal({
            title: "ENV Berhasil Disimpan di Vercel",
            description: `Variabel lingkungan berhasil diperbarui di Vercel! Namun trigger auto-deploy memerlukan redeploy manual: ${data.deployError || "Deployment ID tidak ditemukan"}. Silakan buka dashboard Vercel dan klik tombol Redeploy.`,
            variant: "warning",
          });
        }
      } else {
        await alertModal({
          title: "Gagal Update Vercel",
          description: data.message || "Pastikan VERCEL_ACCESS_TOKEN dan VERCEL_PROJECT_ID terpasang di Vercel ENV.",
          variant: "error",
        });
      }
    } catch (err: any) {
      await alertModal({
        title: "Error Vercel",
        description: err?.message || "Gagal menghubungi API Vercel.",
        variant: "error",
      });
    } finally {
      setIsUpdatingVercel(false);
    }
  };

  // 5. Generate Vercel ENV Snippet (Manual copy backup)
  const getVercelEnvSnippet = () => {
    if (selectedProvider === "postgres") {
      return `NEXT_PUBLIC_DB_PROVIDER="postgres"\nDATABASE_URL="${dbUrl.trim()}"`;
    }
    return `NEXT_PUBLIC_DB_PROVIDER="firebase"`;
  };

  // 6. Copy Vercel ENV
  const handleCopyEnv = () => {
    navigator.clipboard.writeText(getVercelEnvSnippet());
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  return (
    <section className="bg-card border rounded-xl p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Database Provider & Migrasi PostgreSQL
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gunakan Firebase bawaan atau hubungkan ke database PostgreSQL milik Anda sendiri (Supabase, Neon, Railway, Docker, atau VPS pribadi).
          </p>
        </div>

        {/* Active Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary shrink-0 self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>
            Aktif: {activeProvider === "firebase" ? "Firebase Bawaan (Cloud)" : "PostgreSQL (Connection String)"}
          </span>
        </div>
      </div>

      {/* Provider Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 1. Firebase Default */}
        <div
          onClick={() => { setSelectedProvider("firebase"); setTestResult(null); }}
          className={cn(
            "p-5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-3",
            selectedProvider === "firebase"
              ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary/30"
              : "border-border hover:border-primary/40 bg-muted/10 hover:bg-muted/20"
          )}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="p-2.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Flame className="w-5 h-5" />
              </span>
              {activeProvider === "firebase" && (
                <span className="text-[10px] font-bold text-primary bg-primary/15 px-2.5 py-0.5 rounded-full">Sedang Aktif</span>
              )}
            </div>
            <p className="font-semibold text-sm pt-2">Firebase Bawaan (Cloud Default)</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Database cloud bawaan aplikasi. Menggunakan kredensial Firebase yang telah terpasang di Vercel ENV.
            </p>
          </div>
          <span className="text-[11px] font-medium text-primary flex items-center gap-1">
            {selectedProvider === "firebase" ? "✓ Terpilih" : "Pilih Provider"}
          </span>
        </div>

        {/* 2. PostgreSQL / Supabase */}
        <div
          onClick={() => { setSelectedProvider("postgres"); setTestResult(null); }}
          className={cn(
            "p-5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-3",
            selectedProvider === "postgres"
              ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary/30"
              : "border-border hover:border-primary/40 bg-muted/10 hover:bg-muted/20"
          )}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Server className="w-5 h-5" />
              </span>
              {activeProvider === "postgres" && (
                <span className="text-[10px] font-bold text-primary bg-primary/15 px-2.5 py-0.5 rounded-full">Sedang Aktif</span>
              )}
            </div>
            <p className="font-semibold text-sm pt-2">PostgreSQL (Supabase / VPS / Neon)</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Koneksi universal via Connection String (URI). Mendukung Supabase, Neon, Railway, Docker, dan VPS pribadi.
            </p>
          </div>
          <span className="text-[11px] font-medium text-primary flex items-center gap-1">
            {selectedProvider === "postgres" ? "✓ Terpilih" : "Pilih Provider"}
          </span>
        </div>
      </div>

      {/* Form Kredensial PostgreSQL Connection String */}
      {selectedProvider === "postgres" && (
        <div className="p-5 rounded-xl border bg-muted/20 space-y-4">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-500" />
              PostgreSQL Connection String (DATABASE_URL)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Masukkan URI koneksi database PostgreSQL Anda. 15 tabel koleksi (projects, timeline_tasks, notes, dll.) akan otomatis dibuat di database target.
            </p>
          </div>

          <div className="space-y-1.5 text-xs">
            <label className="font-medium text-foreground">Connection String URI *</label>
            <Input
              type="password"
              placeholder="postgresql://postgres:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
              value={dbUrl}
              onChange={(e) => setDbUrl(e.target.value)}
              className="h-9 text-xs font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Format: <code className="text-foreground">postgresql://username:password@hostname:port/database</code>
            </p>
          </div>

          {/* Action Toolbar khusus PostgreSQL: Uji Koneksi, Migrasi, dan Panduan */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-border/50">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={isTesting || isMigrating}
                className="gap-2 text-xs h-8 bg-background shadow-2xs font-medium"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isTesting && "animate-spin")} />
                {isTesting ? "Menguji..." : "Uji Koneksi"}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleStartMigration}
                disabled={isMigrating || isTesting || isUpdatingVercel}
                className="gap-1.5 text-xs h-8 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-background hover:bg-emerald-500/10 font-medium shadow-2xs"
                title="Unduh backup JSON otomatis dan transfer data Firebase ke 15 tabel PostgreSQL"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                {isMigrating ? "Memindahkan..." : "Migrasikan Data dari Firebase"}
              </Button>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsGuideOpen(!isGuideOpen)}
              className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-foreground self-start sm:self-auto"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Panduan Setup</span>
              {isGuideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      )}

      {/* Interactive Guide Panel (Muncul tepat di bawah container PostgreSQL) */}
      {selectedProvider === "postgres" && isGuideOpen && (
        <div className="p-4 rounded-xl border bg-muted/30 space-y-4 text-xs animate-in fade-in-50 duration-200">
          <div className="flex items-center gap-2 border-b pb-2 flex-wrap">
            <button
              onClick={() => setActiveGuideTab("supabase")}
              className={cn(
                "px-3 py-1 rounded-lg font-medium transition-colors text-xs",
                activeGuideTab === "supabase" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              1. Ambil URI di Supabase
            </button>
            <button
              onClick={() => setActiveGuideTab("other")}
              className={cn(
                "px-3 py-1 rounded-lg font-medium transition-colors text-xs",
                activeGuideTab === "other" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              2. Neon / Railway / VPS / Docker
            </button>
            <button
              onClick={() => setActiveGuideTab("vercel")}
              className={cn(
                "px-3 py-1 rounded-lg font-medium transition-colors text-xs",
                activeGuideTab === "vercel" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              3. Setup Token Vercel di ENV
            </button>
          </div>

          {activeGuideTab === "supabase" && (
            <div className="space-y-2.5 leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">Cara Mengambil Connection String di Supabase:</p>
              <ol className="list-decimal pl-4 space-y-1.5">
                <li>Buka dashboard proyek Anda di <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-primary underline">supabase.com</a>.</li>
                <li>Di bagian atas (header), klik tombol <b>Connect</b> (atau buka menu <b>Project Settings &gt; Database</b>).</li>
                <li>Pilih tab <b>URI</b> (Connection String). Formatnya: <code>postgresql://postgres.xxx:[YOUR-PASSWORD]@aws-0-xxx.pooler.supabase.com:6543/postgres</code>.</li>
                <li>Ganti <code>[YOUR-PASSWORD]</code> dengan password database yang Anda buat saat pertama kali setup project Supabase.</li>
                <li>Tempel di form di atas, klik <b>Uji Koneksi</b>, lalu klik <b>Migrasikan Data dari Firebase</b> (15 tabel otomatis terbuat!).</li>
              </ol>
            </div>
          )}

          {activeGuideTab === "other" && (
            <div className="space-y-2.5 leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">Cara Menggunakan di Penyedia Lain:</p>
              <ul className="list-disc pl-4 space-y-1.5">
                <li><b>Neon Database:</b> Buka dashboard Neon &gt; Dashboard &gt; Connection Details &gt; Salin connection string <code>postgres://...</code>.</li>
                <li><b>Railway:</b> Buka service PostgreSQL di Railway &gt; Variables &gt; Salin nilai dari <code>DATABASE_URL</code>.</li>
                <li><b>Self-Hosted VPS (Ubuntu/Debian):</b> Gunakan format <code>postgresql://username:password@IP-VPS-ANDA:5432/nama_database</code>.</li>
                <li><b>Docker:</b> Gunakan URI container PostgreSQL Anda.</li>
              </ul>
              <p className="text-[11px] italic text-primary">
                * Catatan: Sistem akan otomatis membuat 15 tabel koleksi dan index di database target saat uji koneksi atau migrasi dijalankan.
              </p>
            </div>
          )}

          {activeGuideTab === "vercel" && (
            <div className="space-y-2.5 leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">Cara Memasang Token Vercel di Environment Variables:</p>
              <ol className="list-decimal pl-4 space-y-1.5">
                <li>Buka <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" className="text-primary underline">vercel.com/account/tokens</a> lalu klik <b>Create Token</b> (Beri nama bebas, misal "Planner-Auto-Deploy").</li>
                <li>Salin token tersebut, lalu buka proyek Anda di Vercel &gt; <b>Settings &gt; Environment Variables</b>.</li>
                <li>Tambahkan variabel baru:
                  <ul className="list-disc pl-5 mt-1 space-y-0.5 font-mono text-[11px] text-foreground">
                    <li><code>VERCEL_ACCESS_TOKEN</code> = isi token dari langkah 1</li>
                    <li><code>VERCEL_PROJECT_ID</code> = isi Project ID (bisa dilihat di menu <i>Settings &gt; General &gt; Project ID</i>)</li>
                  </ul>
                </li>
                <li>Selesai! Sekarang tombol <b>Push ke Vercel & Deploy</b> akan langsung memperbarui <code>DATABASE_URL</code> dan me-redeploy web Anda secara instan.</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Test Connection Banner / Result */}
      {testResult && (
        <div className={cn(
          "p-3 rounded-lg border text-xs flex items-center gap-2.5",
          testResult.success
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
            : "bg-destructive/10 border-destructive/30 text-destructive"
        )}>
          {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{testResult.success ? testResult.message : testResult.error}</span>
        </div>
      )}

      {/* Migration Progress Bar */}
      {migrationProgress && (
        <div className="p-4 rounded-xl border bg-primary/5 border-primary/20 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
              {migrationProgress.statusText}
            </span>
            <span className="text-primary font-mono">{migrationProgress.percentage}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${migrationProgress.percentage}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Koleksi {migrationProgress.collectionIndex} dari {migrationProgress.totalCollections}: <span className="font-mono font-medium text-foreground">{migrationProgress.currentCollection}</span>
          </p>
        </div>
      )}

      {/* Footer Simpan & Aktivasi Database */}
      <div className="p-4 rounded-xl border bg-card/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-foreground whitespace-nowrap">Target Database:</span>
              <span className="text-xs font-bold text-primary px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 whitespace-nowrap">
                {selectedProvider === "postgres" ? "PostgreSQL (Supabase / VPS)" : "Firebase Bawaan"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Pilih simpan lokal (testing instan) atau push ke Vercel (produksi).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0 justify-end flex-wrap sm:flex-nowrap">
          {/* Tombol 1: Terapkan Sekarang (Instan di Browser) */}
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveAndActivate}
            disabled={isMigrating || isTesting || isUpdatingVercel}
            className="gap-2 text-xs h-9 border-primary/40 text-primary hover:bg-primary/10 font-medium shadow-2xs w-full sm:w-auto whitespace-nowrap"
            title="Simpan pilihan database ini dan langsung aktifkan di browser detik ini juga (untuk testing)"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Terapkan Sekarang (Instan)</span>
          </Button>

          {/* Tombol 2: Push ke Vercel & Auto-Deploy (Permanen di Server) */}
          <Button
            type="button"
            onClick={handleUpdateVercel}
            disabled={isMigrating || isTesting || isUpdatingVercel}
            className="gap-2 text-xs h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs w-full sm:w-auto whitespace-nowrap"
            title="Simpan DATABASE_URL ke Vercel dan redeploy agar aktif permanen untuk semua pengunjung (produksi)"
          >
            <Zap className={cn("w-4 h-4", isUpdatingVercel && "animate-spin")} />
            <span>{isUpdatingVercel ? "Mengupdate Vercel..." : "Push ke Vercel & Auto-Deploy"}</span>
          </Button>
        </div>
      </div>

      {/* Vercel Integration Status & Card */}
      <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-primary" />
                Vercel API Integration Status:
              </p>
              {vercelConfigured ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> ENV Vercel Aktif di Server
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                  Belum Ada VERCEL_ACCESS_TOKEN di ENV
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Ketika tombol <b>"Push ke Vercel & Auto-Deploy"</b> ditekan, sistem otomatis mengupdate <code>DATABASE_URL</code> di Vercel dan memicu redeploy otomatis.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyEnv}
              className="h-7 text-xs gap-1.5"
              title="Salin manual jika tidak ingin lewat API"
            >
              {copiedEnv ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedEnv ? "Tersalin!" : "Salin Teks ENV"}
            </Button>
            {!vercelConfigured && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowVercelManualInput(!showVercelManualInput)}
                className="h-7 text-xs text-muted-foreground"
              >
                {showVercelManualInput ? "Sembunyikan Form Token" : "Input Token Manual"}
              </Button>
            )}
          </div>
        </div>

        {/* Manual Vercel Token Form (Hanya jika belum diset di server ENV) */}
        {showVercelManualInput && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t">
            <Input
              placeholder="Vercel Access Token (jika belum diset di server ENV)"
              value={vercelToken}
              onChange={(e) => setVercelToken(e.target.value)}
              className="h-8 text-[11px] font-mono"
            />
            <Input
              placeholder="Vercel Project ID (prj_...)"
              value={vercelProjectId}
              onChange={(e) => setVercelProjectId(e.target.value)}
              className="h-8 text-[11px] font-mono"
            />
          </div>
        )}
      </div>

      
    </section>
  );
}
