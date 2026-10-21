"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth-context";
import { useAlertModal, useConfirm } from "@/components/confirm-dialog-provider";
import { updateUserPassword } from "@/app/login/actions";
import {
  KeyRound,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  User,
  Sparkles,
  Info,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { currentUser, isSuperAdmin } = useAuth();
  const alertModal = useAlertModal();
  const confirm = useConfirm();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const displayName = currentUser?.name || currentUser?.username || "Pengguna";
  const username = currentUser?.username || "";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "US";

  // Password Strength Evaluation
  const strength = useMemo(() => {
    const val = newPassword;
    let score = 0;
    if (val.length >= 6) score += 1;
    if (val.length >= 10) score += 1;
    if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score += 1;
    if (/\d/.test(val)) score += 1;
    if (/[^A-Za-z0-9]/.test(val)) score += 1;

    let label = "Sangat Lemah";
    let color = "bg-destructive";
    let textColor = "text-destructive";

    if (score <= 1) {
      label = "Lemah";
      color = "bg-rose-500";
      textColor = "text-rose-500";
    } else if (score === 2) {
      label = "Cukup";
      color = "bg-amber-500";
      textColor = "text-amber-500";
    } else if (score === 3 || score === 4) {
      label = "Baik";
      color = "bg-blue-500";
      textColor = "text-blue-500";
    } else if (score >= 5) {
      label = "Kuat & Aman";
      color = "bg-emerald-500";
      textColor = "text-emerald-500";
    }

    return { score: Math.min(score, 5), label, color, textColor };
  }, [newPassword]);

  // Validation Flags
  const isMinLength = newPassword.length >= 6;
  const isDifferentFromCurrent = currentPassword.length > 0 && newPassword !== currentPassword;
  const isConfirmed = newPassword.length > 0 && newPassword === confirmPassword;
  const isFormValid =
    currentPassword.length > 0 &&
    isMinLength &&
    isDifferentFromCurrent &&
    isConfirmed &&
    !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isMinLength) {
      await alertModal({
        title: "Password Terlalu Pendek",
        description: "Password baru harus memiliki minimal 6 karakter.",
        variant: "warning",
      });
      return;
    }

    if (newPassword === currentPassword) {
      await alertModal({
        title: "Password Tidak Berubah",
        description: "Password baru tidak boleh sama persis dengan password lama.",
        variant: "warning",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      await alertModal({
        title: "Konfirmasi Password Tidak Cocok",
        description: "Password baru dan konfirmasi password harus sama.",
        variant: "warning",
      });
      return;
    }

    const ok = await confirm({
      title: "Ganti Kata Sandi?",
      description: `Apakah Anda yakin ingin memperbarui password akun "${username}"? Anda harus menggunakan password baru ini untuk login berikutnya.`,
      confirmText: "Ya, Ganti Password",
      cancelText: "Batal",
      variant: "primary",
    });

    if (!ok) return;

    try {
      setIsSubmitting(true);
      const userId = currentUser?.id || "";

      const result = await updateUserPassword(userId, username, currentPassword, newPassword);

      if (!result.success) {
        await alertModal({
          title: "Gagal Mengubah Password",
          description: result.error || "Terjadi kesalahan saat memverifikasi password.",
          variant: "error",
        });
        return;
      }

      // Update cached user passwords locally so immediate re-logins work smoothly
      try {
        const localCached = localStorage.getItem("planner_cached_users");
        if (localCached) {
          const parsed = JSON.parse(localCached);
          if (Array.isArray(parsed)) {
            const updated = parsed.map((u) => {
              if (
                u.id === userId ||
                u.username?.toLowerCase() === username.toLowerCase()
              ) {
                return { ...u, password: newPassword };
              }
              return u;
            });
            localStorage.setItem("planner_cached_users", JSON.stringify(updated));
          }
        }
      } catch (_) {}

      // Reset fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      await alertModal({
        title: "Password Berhasil Diubah",
        description: `Kata sandi akun "${username}" telah berhasil diperbarui. Silakan simpan password baru Anda dengan aman.`,
        variant: "success",
      });
    } catch (err: any) {
      console.error("Change password error:", err);
      await alertModal({
        title: "Terjadi Kesalahan",
        description: err.message || "Gagal mengubah password.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Panel className="min-h-0 border-t-4 border-t-primary flex flex-col max-w-4xl mx-auto w-full">
      <PanelHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b pb-4 gap-4">
        <div>
          <PanelTitle className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-primary" />
            <span>Ganti Password Akun</span>
          </PanelTitle>
          <PanelDescription className="mt-1">
            Kelola dan perbarui kata sandi akun Anda untuk menjaga keamanan akses sistem.
          </PanelDescription>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          className="gap-1.5 text-xs self-start sm:self-auto"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali</span>
        </Button>
      </PanelHeader>

      <PanelContent className="p-4 sm:p-6 space-y-6">
        {/* User Profile Overview Card */}
        <div className="p-4 sm:p-5 rounded-xl border bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0">
              {initials}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base text-foreground">{displayName}</h3>
                {isSuperAdmin && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Super Admin
                  </span>
                )}
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  Aktif
                </span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-mono">
                <User className="w-3.5 h-3.5" />
                Username: <strong className="text-foreground">{username || "admin"}</strong>
              </p>
            </div>
          </div>

          <div className="text-xs text-muted-foreground bg-background px-3 py-2 rounded-lg border w-full sm:w-auto">
            <p className="font-medium text-foreground">Akses Workspace:</p>
            <p className="mt-0.5">
              {isSuperAdmin
                ? "Semua Project (Akses Penuh)"
                : `${currentUser?.projectIds?.length || 0} Project Terkait`}
            </p>
          </div>
        </div>

        {/* Info Banner if Master Admin */}
        {currentUser?.id === "master_admin" && (
          <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs flex items-start gap-2.5 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Informasi Akun Master Administrator:</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Akun Master Admin utama dilindungi oleh variabel lingkungan <code className="bg-background px-1 py-0.5 rounded font-mono font-semibold">SITE_PASSWORD</code> di server.
                Jika Anda memiliki user dokumen dengan username <strong>admin</strong> di database, password dokumen tersebut akan ikut diperbarui.
              </p>
            </div>
          </div>
        )}

        {/* Change Password Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-card border rounded-xl p-5 sm:p-6 shadow-xs space-y-5">
            <h4 className="text-sm font-semibold flex items-center gap-2 border-b pb-3 text-foreground">
              <Lock className="w-4 h-4 text-primary" />
              <span>Formulir Penggantian Password</span>
            </h4>

            {/* Field 1: Current Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Kata Sandi Lama (Current Password) *</span>
              </label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Masukkan password yang saat ini digunakan..."
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Field 2: New Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Kata Sandi Baru (New Password) *</span>
                {newPassword.length > 0 && (
                  <span className={cn("text-[11px] font-bold", strength.textColor)}>
                    {strength.label}
                  </span>
                )}
              </label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Masukkan password baru (minimal 6 karakter)..."
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength Meter Bar */}
              {newPassword.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden flex gap-1">
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <div
                        key={lvl}
                        className={cn(
                          "h-full flex-1 transition-all duration-300 rounded-full",
                          strength.score >= lvl ? strength.color : "bg-muted-foreground/20"
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Field 3: Confirm New Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Konfirmasi Kata Sandi Baru *</span>
                {confirmPassword.length > 0 && (
                  <span
                    className={cn(
                      "text-[11px] font-semibold flex items-center gap-1",
                      isConfirmed ? "text-emerald-500" : "text-destructive"
                    )}
                  >
                    {isConfirmed ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" /> Cocok
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3" /> Belum Cocok
                      </>
                    )}
                  </span>
                )}
              </label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ketik ulang password baru Anda..."
                  className={cn(
                    "pr-10",
                    confirmPassword.length > 0 &&
                      !isConfirmed &&
                      "border-destructive focus-visible:ring-destructive"
                  )}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Password Criteria Checklist */}
            <div className="p-3 bg-muted/30 border rounded-lg space-y-1.5 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground text-[11px] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Ketentuan & Syarat Password:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] pt-1">
                <div className="flex items-center gap-1.5">
                  {isMinLength ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                  )}
                  <span className={isMinLength ? "text-foreground font-medium" : ""}>
                    Minimal 6 karakter
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isDifferentFromCurrent ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                  )}
                  <span className={isDifferentFromCurrent ? "text-foreground font-medium" : ""}>
                    Berbeda dari password lama
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isConfirmed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                  )}
                  <span className={isConfirmed ? "text-foreground font-medium" : ""}>
                    Konfirmasi password sama persis
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {strength.score >= 3 ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                  )}
                  <span className={strength.score >= 3 ? "text-foreground font-medium" : ""}>
                    Kombinasi huruf, angka, atau simbol
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
              }}
              disabled={isSubmitting || (!currentPassword && !newPassword && !confirmPassword)}
            >
              Reset Form
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="gap-2 px-5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan Password...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Simpan Password Baru</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </PanelContent>
    </Panel>
  );
}
