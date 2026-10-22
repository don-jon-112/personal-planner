"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Panel, PanelContent } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useCollection, useDeleteDocument } from "@/hooks/use-firestore";
import { useAuth } from "@/components/auth-context";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { TaskAssignmentLog, FieldChange } from "@/types/user-role";
import { fetchCachedAssignmentLogs, saveAssignmentLogsToRedis } from "@/lib/cache-client";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  Search,
  Lock,
  Calendar,
  Clock,
  Layers,
  FolderKanban,
  User,
  Shield,
  ArrowRight,
  Filter,
  CheckCircle2,
  TrendingUp,
  Users as UsersIcon,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Database,
  Zap,
  ChevronDown,
  Trash2,
  Key,
  FileSpreadsheet,
  Eye,
  EyeOff,
  Activity,
  Plus,
  Edit3,
  Check,
  Copy,
} from "lucide-react";

const TARGET_DELETED_TASK = "Migrate API Auto2000BodyPaintController getBodyPaintDetails";

export default function AssignmentLogsPage() {
  const { isSuperAdmin } = useAuth();

  const confirm = useConfirm();
  const { mutateAsync: deleteLogDoc } = useDeleteDocument("assignmentLogs");

  const { data: rawLogs = [], isLoading, refetch, isFetching } = useCollection<TaskAssignmentLog>("assignmentLogs");
  const { data: projects = [] } = useCollection<any>("projects");

  const [localLogs, setLocalLogs] = useState<TaskAssignmentLog[]>([]);
  const [cacheSource, setCacheSource] = useState<"redis" | "firebase" | "loading">("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<"all" | "task" | "secret">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 15;

  // Selected Log for Detail Modal
  const [selectedLog, setSelectedLog] = useState<TaskAssignmentLog | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isMaskedDetail, setIsMaskedDetail] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Helper to determine category of a log item
  const getLogCategory = (log: TaskAssignmentLog): "task" | "secret" => {
    if (log.category === "secret" || log.secretKey || log.secretAction) {
      return "secret";
    }
    return "task";
  };

  // Active logs: filter out target deleted task and prefer localLogs
  const activeLogs = useMemo(() => {
    const base = localLogs.length > 0 ? localLogs : rawLogs;
    return base.filter((l) => !(l.taskName || "").includes(TARGET_DELETED_TASK));
  }, [localLogs, rawLogs]);

  // Tab counts
  const tabCounts = useMemo(() => {
    let taskCount = 0;
    let secretCount = 0;
    activeLogs.forEach((l) => {
      if (getLogCategory(l) === "secret") {
        secretCount++;
      } else {
        taskCount++;
      }
    });
    return {
      all: activeLogs.length,
      task: taskCount,
      secret: secretCount,
    };
  }, [activeLogs]);

  // Auto-cleanup requested log from Firestore and sync Redis
  useEffect(() => {
    const target = rawLogs.find((l) => (l.taskName || "").includes(TARGET_DELETED_TASK));
    if (target && target.id) {
      deleteLogDoc(target.id)
        .then(() => {
          setLocalLogs((prev) => {
            const next = prev.filter((item) => item.id !== target.id && !(item.taskName || "").includes(TARGET_DELETED_TASK));
            saveAssignmentLogsToRedis(next).catch(console.warn);
            return next;
          });
        })
        .catch(console.error);
    }
  }, [rawLogs, deleteLogDoc]);

  // Initial load: fetch fast from Redis cache, fallback to Firestore
  useEffect(() => {
    let isMounted = true;

    async function initLogs() {
      try {
        const cached = await fetchCachedAssignmentLogs();
        if (!isMounted) return;
        if (cached.source === "redis" && Array.isArray(cached.logs) && cached.logs.length > 0) {
          setLocalLogs(cached.logs);
          setCacheSource("redis");
          setLastRefreshedAt(new Date());
          return;
        }
      } catch (err) {
        console.warn("Initial Redis cache check failed:", err);
      }

      if (rawLogs && rawLogs.length > 0) {
        setLocalLogs(rawLogs);
        setCacheSource("firebase");
        setLastRefreshedAt(new Date());
        saveAssignmentLogsToRedis(rawLogs).catch(console.warn);
      }
    }

    initLogs();

    return () => {
      isMounted = false;
    };
  }, []);

  // When rawLogs from Firebase update, keep localLogs in sync and refresh Redis cache
  useEffect(() => {
    if (rawLogs && rawLogs.length > 0) {
      if (cacheSource !== "redis" || localLogs.length === 0) {
        setLocalLogs(rawLogs);
        setCacheSource("firebase");
        setLastRefreshedAt(new Date());
      }
      saveAssignmentLogsToRedis(rawLogs).catch(console.warn);
    }
  }, [rawLogs]);

  // Refresh handler: automatically gets data from Firebase and syncs to Redis, with fallback
  const handleRefresh = async (source: "auto" | "firebase" | "redis" = "auto") => {
    setIsRefreshing(true);
    setStatusMessage(null);

    try {
      if (source === "redis") {
        const cached = await fetchCachedAssignmentLogs();
        if (cached.source === "redis" && Array.isArray(cached.logs) && cached.logs.length > 0) {
          const cleaned = cached.logs.filter((l) => !(l.taskName || "").includes(TARGET_DELETED_TASK));
          setLocalLogs(cleaned);
          setCacheSource("redis");
          setLastRefreshedAt(new Date());
          setStatusMessage(`Berhasil memuat ${cleaned.length} data log dari Redis Cache.`);
        } else {
          const res = await refetch();
          const fresh = (res.data || []).filter((l) => !(l.taskName || "").includes(TARGET_DELETED_TASK));
          setLocalLogs(fresh);
          setCacheSource("firebase");
          setLastRefreshedAt(new Date());
          setStatusMessage(`Redis cache kosong, data dimuat dari Firebase (${fresh.length} log).`);
          if (fresh.length > 0) {
            saveAssignmentLogsToRedis(fresh).catch(console.warn);
          }
        }
      } else if (source === "firebase") {
        const res = await refetch();
        const fresh = (res.data || []).filter((l) => !(l.taskName || "").includes(TARGET_DELETED_TASK));
        setLocalLogs(fresh);
        setCacheSource("firebase");
        setLastRefreshedAt(new Date());
        setStatusMessage(`Berhasil memuat ${fresh.length} data log langsung dari Firebase.`);
        if (fresh.length > 0) {
          saveAssignmentLogsToRedis(fresh).catch(console.warn);
        }
      } else {
        // "auto" (default & recommended)
        let freshLogs: TaskAssignmentLog[] = [];
        try {
          const res = await refetch();
          freshLogs = (res.data || []).filter((l) => !(l.taskName || "").includes(TARGET_DELETED_TASK));
        } catch (fbErr) {
          console.warn("Firebase refetch failed in auto mode:", fbErr);
        }

        if (freshLogs.length > 0) {
          setLocalLogs(freshLogs);
          setCacheSource("firebase");
          setLastRefreshedAt(new Date());
          saveAssignmentLogsToRedis(freshLogs).catch(console.warn);
          setStatusMessage(`Data berhasil diperbarui dari Firebase & disinkronkan ke Redis (${freshLogs.length} log).`);
        } else {
          // Fallback to Redis
          const cached = await fetchCachedAssignmentLogs();
          if (cached.source === "redis" && Array.isArray(cached.logs) && cached.logs.length > 0) {
            const cleaned = cached.logs.filter((l) => !(l.taskName || "").includes(TARGET_DELETED_TASK));
            setLocalLogs(cleaned);
            setCacheSource("redis");
            setLastRefreshedAt(new Date());
            setStatusMessage(`Data dimuat dari Redis Cache (${cleaned.length} log).`);
          } else {
            setCacheSource("firebase");
            setStatusMessage("Pembaruan selesai.");
          }
        }
      }
    } catch (err: any) {
      console.error("Refresh error:", err);
      setStatusMessage("Gagal memperbarui data. Silakan coba lagi.");
    } finally {
      setIsRefreshing(false);
      setTimeout(() => {
        setStatusMessage(null);
      }, 4000);
    }
  };

  const handleDeleteLog = async (log: TaskAssignmentLog) => {
    const isSecret = getLogCategory(log) === "secret";
    const titleText = isSecret
      ? `Hapus Log Perubahan Secret "${log.secretKey || "Secret"}"?`
      : `Hapus Log Penugasan Task "${log.taskName}"?`;

    const ok = await confirm({
      title: "Hapus Catatan Log?",
      description: `${titleText} Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Hapus Log",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await deleteLogDoc(log.id);
      setLocalLogs((prev) => {
        const next = prev.filter((item) => item.id !== log.id);
        saveAssignmentLogsToRedis(next).catch(console.warn);
        return next;
      });
      setStatusMessage("Catatan log berhasil dihapus.");
    } catch (err) {
      console.error("Gagal menghapus log:", err);
      setStatusMessage("Gagal menghapus catatan log. Silakan coba lagi.");
    }
  };

  // Sort logs: newest first
  const sortedLogs = useMemo(() => {
    return [...activeLogs].sort((a, b) => {
      const timeA = a.claimedAt?.toMillis ? a.claimedAt.toMillis() : new Date(a.timestamp || 0).getTime();
      const timeB = b.claimedAt?.toMillis ? b.claimedAt.toMillis() : new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });
  }, [activeLogs]);

  // Unique users list for filter
  const uniqueUsers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; username: string }>();
    activeLogs.forEach((l) => {
      const key = l.userId || l.username;
      if (key && !map.has(key)) {
        map.set(key, {
          id: l.userId,
          name: l.userName || l.username,
          username: l.username,
        });
      }
    });
    return Array.from(map.values());
  }, [activeLogs]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return sortedLogs.filter((log) => {
      const category = getLogCategory(log);

      // Tab filter
      if (activeTab === "task" && category !== "task") return false;
      if (activeTab === "secret" && category !== "secret") return false;

      // Project filter
      if (projectFilter !== "all" && log.projectId !== projectFilter) return false;

      // User filter
      if (userFilter !== "all" && log.userId !== userFilter && log.username !== userFilter) return false;

      // Action filter
      if (actionFilter !== "all") {
        const actionCode = (log.action || log.secretAction || "").toUpperCase();
        if (actionFilter === "CLAIM_TASK" && actionCode !== "CLAIM_TASK" && actionCode !== "ON PROGRESS" && !(!log.action && category === "task")) {
          return false;
        }
        if (actionFilter === "STATUS_CHANGE" && actionCode !== "STATUS_CHANGE") return false;
        if (actionFilter === "BACK_TODO" && actionCode !== "BACK_TODO") return false;
        if (actionFilter === "CREATE" && actionCode !== "CREATE" && actionCode !== "SECRET_CREATED") return false;
        if (actionFilter === "UPDATE" && actionCode !== "UPDATE" && actionCode !== "SECRET_UPDATED") return false;
        if (actionFilter === "DELETE" && actionCode !== "DELETE" && actionCode !== "SECRET_DELETED") return false;
        if (actionFilter === "TOGGLE_PROD" && actionCode !== "TOGGLE_PROD") return false;
        if (actionFilter === "IMPORT" && actionCode !== "IMPORT" && actionCode !== "SECRET_IMPORTED") return false;
      }

      // Search Query
      const q = searchQuery.toLowerCase().trim();
      if (q.length >= 2) {
        const matchesSearch =
          (log.taskName || "").toLowerCase().includes(q) ||
          (log.secretKey || "").toLowerCase().includes(q) ||
          (log.secretOriginal || "").toLowerCase().includes(q) ||
          (log.details || "").toLowerCase().includes(q) ||
          (log.userName || "").toLowerCase().includes(q) ||
          (log.username || "").toLowerCase().includes(q) ||
          (log.epicName || "").toLowerCase().includes(q) ||
          (log.projectName || "").toLowerCase().includes(q) ||
          (log.action || "").toLowerCase().includes(q) ||
          (log.previousPic || "").toLowerCase().includes(q);

        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [sortedLogs, activeTab, searchQuery, projectFilter, userFilter, actionFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = useMemo(() => {
    const start = currentPage * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Metrics calculation
  const metrics = useMemo(() => {
    const totalEntries = activeLogs.length;

    // Task claims metrics
    const taskLogs = activeLogs.filter((l) => getLogCategory(l) === "task");
    const totalTaskClaims = taskLogs.length;
    const totalMd = taskLogs.reduce((acc, l) => acc + (Number(l.md) || 0), 0);

    // Secret metrics
    const secretLogs = activeLogs.filter((l) => getLogCategory(l) === "secret");
    const totalSecretChanges = secretLogs.length;
    const secretCreated = secretLogs.filter((l) => (l.action || l.secretAction) === "CREATE").length;
    const secretUpdated = secretLogs.filter((l) => (l.action || l.secretAction) === "UPDATE").length;
    const secretDeleted = secretLogs.filter((l) => (l.action || l.secretAction) === "DELETE").length;
    const secretToggleProd = secretLogs.filter((l) => (l.action || l.secretAction) === "TOGGLE_PROD").length;
    const secretImport = secretLogs.filter((l) => (l.action || l.secretAction) === "IMPORT").length;

    // Contributor users
    const uniqueActors = new Set(activeLogs.map((l) => l.userId || l.username)).size;

    return {
      totalEntries,
      totalTaskClaims,
      totalMd,
      totalSecretChanges,
      secretCreated,
      secretUpdated,
      secretDeleted,
      secretToggleProd,
      secretImport,
      uniqueActors,
    };
  }, [activeLogs]);

  // Format Timestamp
  const formatTimestamp = (log: TaskAssignmentLog) => {
    let dateObj: Date;
    if (log.claimedAt?.toDate) {
      dateObj = log.claimedAt.toDate();
    } else if (log.claimedAt?.seconds) {
      dateObj = new Date(log.claimedAt.seconds * 1000);
    } else if (log.timestamp) {
      dateObj = new Date(log.timestamp);
    } else {
      return "-";
    }

    if (isNaN(dateObj.getTime())) return "-";

    const formattedDate = dateObj.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const formattedTime = dateObj.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return `${formattedDate}, ${formattedTime}`;
  };

  // Helper to open detail dialog
  const handleOpenDetail = (log: TaskAssignmentLog) => {
    setSelectedLog(log);
    setIsMaskedDetail(false);
    setIsDetailOpen(true);
  };

  const handleCopyText = (text?: string, keyId?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId || text);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Render Action Badge
  const renderActionBadge = (log: TaskAssignmentLog) => {
    const isSecret = getLogCategory(log) === "secret";
    const action = (log.action || log.secretAction || (isSecret ? "UPDATE" : "CLAIM_TASK")).toUpperCase();

    if (isSecret) {
      switch (action) {
        case "CREATE":
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Plus className="w-2.5 h-2.5" />
              CREATE
            </span>
          );
        case "UPDATE":
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <Edit3 className="w-2.5 h-2.5" />
              UPDATE
            </span>
          );
        case "DELETE":
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              <Trash2 className="w-2.5 h-2.5" />
              DELETE
            </span>
          );
        case "TOGGLE_PROD":
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Shield className="w-2.5 h-2.5" />
              TOGGLE PROD
            </span>
          );
        case "IMPORT":
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              <FileSpreadsheet className="w-2.5 h-2.5" />
              IMPORT
            </span>
          );
        default:
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
              {action}
            </span>
          );
      }
    } else {
      if (action === "BACK_TODO") {
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-2.5 h-2.5" />
            BACK TODO
          </span>
        );
      }
      if (action === "STATUS_CHANGE") {
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
            <RefreshCw className="w-2.5 h-2.5" />
            STATUS CHANGE
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
          <ClipboardList className="w-2.5 h-2.5" />
          CLAIM TASK
        </span>
      );
    }
  };

  // Super Admin Access Check
  if (!isSuperAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Panel className="max-w-md text-center p-8 border-destructive/30 bg-destructive/5">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-1">Access Restricted</h2>
          <p className="text-xs text-muted-foreground">
            Audit Logs are reserved exclusively for the <strong>Master Administrator</strong>.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-4 p-4 sm:p-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              Audit Logs & Activity Trail
            </h1>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Shield className="w-3 h-3" />
              Master Admin Only
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Riwayat terpadu aktivitas pengguna: penugasan task (Assign To Me) dan modifikasi Secret Key Vault secara realtime.
          </p>
        </div>

        {/* Right Header: Refresh Button & Source Status */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Cache / Live Status Badge */}
          <div
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors shadow-2xs select-none",
              isRefreshing || isFetching
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                : cacheSource === "redis"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
            )}
            title={
              isRefreshing || isFetching
                ? "Sedang menyinkronkan data terbaru..."
                : cacheSource === "redis"
                ? "Data saat ini dimuat dari Redis Fast Cache"
                : "Data saat ini disinkronkan langsung dari Firebase Firestore"
            }
          >
            {isRefreshing || isFetching ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
                <span>Memperbarui...</span>
              </>
            ) : cacheSource === "redis" ? (
              <>
                <Zap className="w-3.5 h-3.5 text-emerald-500" />
                <span>Redis Cache</span>
              </>
            ) : (
              <>
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span>Firebase Live</span>
              </>
            )}
          </div>

          {/* Timestamp */}
          {lastRefreshedAt && (
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-muted-foreground font-medium select-none">
              <Clock className="w-3 h-3 opacity-60" />
              Diperbarui: {lastRefreshedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}

          {/* Split Refresh Button with Options */}
          <div className="flex items-center rounded-md border bg-card shadow-xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleRefresh("auto")}
              disabled={isRefreshing || isFetching}
              className="h-8 px-3 text-xs font-semibold gap-1.5 hover:bg-accent hover:text-accent-foreground rounded-r-none border-r"
              title="Otomatis muat data terbaru dari Firebase dan perbarui Redis Cache"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", (isRefreshing || isFetching) && "animate-spin text-primary")} />
              <span>{isRefreshing || isFetching ? "Menyinkronkan..." : "Refresh Data"}</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={isRefreshing || isFetching}
                className="h-8 px-2 hover:bg-accent hover:text-accent-foreground text-muted-foreground rounded-r-md transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50"
                title="Pilihan sumber data refresh"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 text-xs">
                <DropdownMenuLabel>Pilih Sumber Data</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => handleRefresh("auto")} className="cursor-pointer gap-2 py-2">
                  <RefreshCw className="w-3.5 h-3.5 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-semibold">Otomatis (Rekomendasi)</span>
                    <span className="text-[10px] text-muted-foreground">Firebase live + sinkronkan ke Redis</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleRefresh("firebase")} className="cursor-pointer gap-2 py-2">
                  <Database className="w-3.5 h-3.5 text-blue-500" />
                  <div className="flex flex-col">
                    <span className="font-semibold">Firebase Cloud Firestore</span>
                    <span className="text-[10px] text-muted-foreground">Ambil langsung dari Firestore cloud</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleRefresh("redis")} className="cursor-pointer gap-2 py-2">
                  <Zap className="w-3.5 h-3.5 text-emerald-500" />
                  <div className="flex flex-col">
                    <span className="font-semibold">Redis Fast Cache</span>
                    <span className="text-[10px] text-muted-foreground">Ambil dari memori server Redis</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Status Notice Banner (dismissible) */}
      {statusMessage && (
        <div className="px-3.5 py-2 rounded-lg text-xs font-medium bg-primary/10 border border-primary/20 text-primary flex items-center justify-between shrink-0 shadow-2xs animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-primary" />
            <span>{statusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="p-1 text-primary/70 hover:text-primary rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex items-center gap-2 border-b pb-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            setActiveTab("all");
            setCurrentPage(0);
          }}
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
            activeTab === "all"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Semua Log</span>
          <span
            className={cn(
              "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
              activeTab === "all" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
            )}
          >
            {tabCounts.all}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("task");
            setCurrentPage(0);
          }}
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
            activeTab === "task"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
        >
          <ClipboardList className="w-3.5 h-3.5" />
          <span>Task Claims</span>
          <span
            className={cn(
              "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
              activeTab === "task" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
            )}
          >
            {tabCounts.task}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("secret");
            setCurrentPage(0);
          }}
          className={cn(
            "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
            activeTab === "secret"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
        >
          <Key className="w-3.5 h-3.5" />
          <span>Secret Key Vault</span>
          <span
            className={cn(
              "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
              activeTab === "secret" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
            )}
          >
            {tabCounts.secret}
          </span>
        </button>
      </div>

      {/* Adaptive Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        {activeTab === "secret" ? (
          <>
            <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">Perubahan Secret</p>
                <p className="text-lg font-bold text-foreground">{metrics.totalSecretChanges}</p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">Secret Baru Ditambah</p>
                <p className="text-lg font-bold text-foreground">{metrics.secretCreated}</p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">Secret Diperbarui</p>
                <p className="text-lg font-bold text-foreground">{metrics.secretUpdated}</p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">Toggle PROD & Import</p>
                <p className="text-lg font-bold text-foreground">{metrics.secretToggleProd + metrics.secretImport}</p>
              </div>
            </div>
          </>
        ) : activeTab === "task" ? (
          <>
            <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">Total Task Diklaim</p>
                <p className="text-lg font-bold text-foreground">{metrics.totalTaskClaims}</p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">Total MD Diambil</p>
                <p className="text-lg font-bold text-foreground">
                  {metrics.totalMd.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">MD</span>
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <UsersIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">User Mengklaim</p>
                <p className="text-lg font-bold text-foreground">
                  {metrics.uniqueActors} <span className="text-xs font-normal text-muted-foreground">orang</span>
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">Rata-rata MD/Task</p>
                <p className="text-lg font-bold text-foreground">
                  {metrics.totalTaskClaims > 0 ? (metrics.totalMd / metrics.totalTaskClaims).toFixed(1) : 0}{" "}
                  <span className="text-xs font-normal text-muted-foreground">MD</span>
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">Total Log Aktivitas</p>
                <p className="text-lg font-bold text-foreground">{metrics.totalEntries}</p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">Task Claims</p>
                <p className="text-lg font-bold text-foreground">
                  {metrics.totalTaskClaims}{" "}
                  <span className="text-xs font-normal text-muted-foreground">({metrics.totalMd.toFixed(1)} MD)</span>
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">Secret Vault Logs</p>
                <p className="text-lg font-bold text-foreground">{metrics.totalSecretChanges}</p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                <UsersIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">Kontributor User</p>
                <p className="text-lg font-bold text-foreground">
                  {metrics.uniqueActors} <span className="text-xs font-normal text-muted-foreground">orang</span>
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5 shrink-0 bg-muted/20 p-2.5 rounded-lg border">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Cari task, secret key, user, action, epic (min. 2 huruf)..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(0);
            }}
            className="pl-8 h-9 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Action Filter */}
        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setCurrentPage(0);
          }}
          className="h-9 px-3 text-xs bg-background border rounded-md text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary w-full sm:w-36"
        >
          <option value="all">Semua Aksi</option>
          {activeTab !== "secret" && (
            <>
              <option value="CLAIM_TASK">Claim Task</option>
              <option value="STATUS_CHANGE">Ubah Status</option>
              <option value="BACK_TODO">Back to TODO</option>
            </>
          )}
          {activeTab !== "task" && (
            <>
              <option value="CREATE">Secret Create</option>
              <option value="UPDATE">Secret Update</option>
              <option value="DELETE">Secret Delete</option>
              <option value="TOGGLE_PROD">Toggle PROD</option>
              <option value="IMPORT">Import Batch</option>
            </>
          )}
        </select>

        {/* Project Filter */}
        <select
          value={projectFilter}
          onChange={(e) => {
            setProjectFilter(e.target.value);
            setCurrentPage(0);
          }}
          className="h-9 px-3 text-xs bg-background border rounded-md text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary w-full sm:w-40"
        >
          <option value="all">Semua Project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* User Filter */}
        <select
          value={userFilter}
          onChange={(e) => {
            setUserFilter(e.target.value);
            setCurrentPage(0);
          }}
          className="h-9 px-3 text-xs bg-background border rounded-md text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary w-full sm:w-36"
        >
          <option value="all">Semua User</option>
          {uniqueUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {/* Logs Table */}
      <Panel className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <PanelContent className="p-0 flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-[150px]">Waktu</TableHead>
                <TableHead className="w-[140px]">Kategori & Aksi</TableHead>
                <TableHead className="w-[170px]">User (Pelaku)</TableHead>
                <TableHead className="w-[240px]">Objek / Target</TableHead>
                <TableHead className="w-[140px]">Project</TableHead>
                <TableHead className="w-[260px]">Detail Perubahan</TableHead>
                <TableHead className="w-[90px] text-right pr-4">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(isLoading && activeLogs.length === 0) || (cacheSource === "loading" && activeLogs.length === 0) ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-xs text-muted-foreground">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary opacity-70" />
                    Memuat catatan audit log dari {cacheSource === "redis" ? "Redis Cache" : "Firebase Firestore"}...
                  </TableCell>
                </TableRow>
              ) : paginatedLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                    <Activity className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold text-sm text-foreground">Belum ada catatan log aktivitas.</p>
                    <p className="text-xs mt-1 max-w-sm mx-auto">
                      {searchQuery || projectFilter !== "all" || userFilter !== "all" || actionFilter !== "all"
                        ? "Tidak ada log yang cocok dengan filter pencarian Anda."
                        : "Log akan otomatis tercatat setiap kali ada klaim task atau perubahan pada Secret Key Vault."}
                    </p>
                    {(searchQuery || projectFilter !== "all" || userFilter !== "all" || actionFilter !== "all") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSearchQuery("");
                          setProjectFilter("all");
                          setUserFilter("all");
                          setActionFilter("all");
                        }}
                        className="mt-3 gap-1.5 text-xs"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reset Filter
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLogs.map((log) => {
                  const category = getLogCategory(log);
                  const isSecret = category === "secret";
                  const targetProject = projects.find((p) => p.id === log.projectId);

                  return (
                    <TableRow
                      key={log.id}
                      onClick={() => handleOpenDetail(log)}
                      className="hover:bg-muted/40 text-xs cursor-pointer group"
                    >
                      {/* Waktu */}
                      <TableCell className="font-medium text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 opacity-60" />
                          <span>{formatTimestamp(log)}</span>
                        </div>
                      </TableCell>

                      {/* Kategori & Aksi */}
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            {isSecret ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                <Key className="w-3 h-3" />
                                Secret Vault
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                                <ClipboardList className="w-3 h-3" />
                                Task Claim
                              </span>
                            )}
                          </div>
                          <div>{renderActionBadge(log)}</div>
                        </div>
                      </TableCell>

                      {/* User (Pelaku) */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "w-7 h-7 rounded-full font-bold flex items-center justify-center text-xs shrink-0",
                              isSecret
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-primary/10 text-primary"
                            )}
                          >
                            {(log.userName || "U")[0].toUpperCase()}
                          </div>
                          <div className="truncate">
                            <p className="font-semibold text-foreground truncate">{log.userName}</p>
                            {log.username && (
                              <p className="text-[11px] text-muted-foreground truncate">@{log.username}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Objek / Target */}
                      <TableCell>
                        {isSecret ? (
                          <div className="space-y-0.5">
                            <p className="font-mono font-bold text-foreground text-xs truncate">
                              {log.secretKey || "Secret Key"}
                            </p>
                            {log.secretOriginal && (
                              <p className="font-mono text-[10px] text-muted-foreground truncate">
                                {log.secretOriginal}
                              </p>
                            )}
                            {log.existsInProd && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                In PROD
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <p className="font-medium text-foreground line-clamp-2">{log.taskName}</p>
                            {log.epicName && log.epicName !== "-" && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded border">
                                <Layers className="w-3 h-3 text-primary" />
                                {log.epicName}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Project */}
                      <TableCell>
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border truncate max-w-[130px]"
                          style={{
                            borderColor: targetProject?.color ? `${targetProject.color}40` : "var(--border)",
                            backgroundColor: targetProject?.color ? `${targetProject.color}15` : "var(--muted)",
                            color: targetProject?.color || "inherit",
                          }}
                        >
                          <FolderKanban className="w-3 h-3 shrink-0" />
                          <span className="truncate">{log.projectName || targetProject?.name || "Global / Shared"}</span>
                        </span>
                      </TableCell>

                      {/* Detail Perubahan */}
                      <TableCell>
                        {isSecret ? (
                          <div className="space-y-1">
                            <p className="text-xs text-foreground font-medium line-clamp-1">
                              {log.details || "Perubahan konfigurasi secret"}
                            </p>
                            {Array.isArray(log.changes) && log.changes.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {log.changes.slice(0, 3).map((c, i) => (
                                  <span
                                    key={i}
                                    className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-muted text-muted-foreground border"
                                  >
                                    {c.label || c.field}
                                  </span>
                                ))}
                                {log.changes.length > 3 && (
                                  <span className="text-[10px] text-muted-foreground self-center">
                                    +{log.changes.length - 3} lainnya
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 text-[10px]">
                                {log.md} MD
                              </span>
                              <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                                <span>{log.startDate || "-"}</span>
                                <ArrowRight className="w-2.5 h-2.5" />
                                <span>{log.endDate || "-"}</span>
                              </div>
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                              <span>PIC sebelumnya: <strong>{log.previousPic || "Unassigned"}</strong></span>
                              <span>•</span>
                              <span>Status: <strong>{log.previousStatus || "TODO"}</strong></span>
                            </div>
                          </div>
                        )}
                      </TableCell>

                      {/* Aksi */}
                      <TableCell className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDetail(log)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                            title="Lihat detail lengkap perubahan"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLog(log)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                            title="Hapus catatan log ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </PanelContent>

        {/* Pagination Footer */}
        {filteredLogs.length > pageSize && (
          <div className="border-t bg-muted/20 px-4 py-2.5 flex items-center justify-between text-xs shrink-0">
            <span className="text-muted-foreground">
              Menampilkan {currentPage * pageSize + 1}–
              {Math.min((currentPage + 1) * pageSize, filteredLogs.length)} dari {filteredLogs.length} log
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                className="h-7 px-2 text-xs gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </Button>
              <span className="px-2 font-medium">
                {currentPage + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                className="h-7 px-2 text-xs gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {/* Detail Dialog / Diff Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[650px] w-[calc(100vw-2rem)] max-h-[85vh] flex flex-col p-0 overflow-hidden">
          {selectedLog && (
            <>
              <DialogHeader className="p-5 pb-3 border-b shrink-0 bg-muted/10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <DialogTitle className="text-base font-bold flex items-center gap-2">
                        {getLogCategory(selectedLog) === "secret" ? (
                          <>
                            <Key className="w-4 h-4 text-emerald-500" />
                            Detail Log Secret Vault
                          </>
                        ) : (
                          <>
                            <ClipboardList className="w-4 h-4 text-primary" />
                            Detail Log Klaim Task
                          </>
                        )}
                      </DialogTitle>
                      {renderActionBadge(selectedLog)}
                    </div>
                    <DialogDescription className="text-xs text-muted-foreground mt-1">
                      Dicatat pada {formatTimestamp(selectedLog)}
                    </DialogDescription>
                  </div>

                  {getLogCategory(selectedLog) === "secret" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsMaskedDetail((prev) => !prev)}
                      className="h-7 px-2 text-xs gap-1.5 shrink-0"
                    >
                      {isMaskedDetail ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Tampilkan Nilai</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Sensor Nilai</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </DialogHeader>

              {/* Modal Body */}
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {/* Meta Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-muted/30 p-3 rounded-lg border text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Pelaku (User)</span>
                    <span className="font-semibold text-foreground">{selectedLog.userName}</span>
                    {selectedLog.username && (
                      <span className="text-[11px] text-muted-foreground block">@{selectedLog.username}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Project</span>
                    <span className="font-semibold text-foreground">{selectedLog.projectName || "Global / Shared"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">Aksi Sistem</span>
                    <span className="font-mono text-xs font-semibold text-primary">{selectedLog.action || selectedLog.secretAction || "ACTIVITY"}</span>
                  </div>
                </div>

                {/* Secret Key Specific Details */}
                {getLogCategory(selectedLog) === "secret" ? (
                  <div className="space-y-3">
                    {/* Key Info Box */}
                    <div className="border rounded-lg p-3 bg-card space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">Secret Key Transform</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(selectedLog.secretKey, "keyName")}
                          className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === "keyName" ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span className="text-emerald-500">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin Key</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="font-mono text-sm font-bold text-foreground bg-muted/50 p-2 rounded border">
                        {selectedLog.secretKey}
                      </p>

                      {selectedLog.secretOriginal && (
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Key Original</span>
                          <p className="font-mono text-xs text-muted-foreground mt-0.5">
                            {selectedLog.secretOriginal}
                          </p>
                        </div>
                      )}

                      {selectedLog.details && (
                        <p className="text-xs text-muted-foreground pt-1 border-t italic">
                          {selectedLog.details}
                        </p>
                      )}
                    </div>

                    {/* Diff Table of Changes */}
                    {Array.isArray(selectedLog.changes) && selectedLog.changes.length > 0 ? (
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <span>Rincian Nilai Perubahan</span>
                          <span className="text-[10px] font-normal text-muted-foreground">
                            ({selectedLog.changes.length} field terpengaruh)
                          </span>
                        </h4>

                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader className="bg-muted/50">
                              <TableRow className="text-xs">
                                <TableHead className="w-[140px] font-bold">Field</TableHead>
                                <TableHead className="font-bold">Nilai Lama</TableHead>
                                <TableHead className="font-bold">Nilai Baru</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedLog.changes.map((change, index) => {
                                const renderValue = (val: any) => {
                                  if (val === null || val === undefined || val === "") {
                                    return <span className="text-muted-foreground/60 italic">(kosong)</span>;
                                  }
                                  const strVal = String(val);
                                  if (isMaskedDetail && change.field !== "existsInProd" && change.field !== "keyName" && change.field !== "keyOriginal") {
                                    return "••••••••";
                                  }
                                  return strVal;
                                };

                                return (
                                  <TableRow key={index} className="text-xs">
                                    <TableCell className="font-semibold text-foreground whitespace-nowrap bg-muted/10">
                                      {change.label || change.field}
                                    </TableCell>
                                    <TableCell className="font-mono text-[11px] text-rose-700 dark:text-rose-400 bg-rose-500/5 break-all">
                                      {renderValue(change.oldValue)}
                                    </TableCell>
                                    <TableCell className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/5 break-all font-medium">
                                      {renderValue(change.newValue)}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg border text-center text-xs text-muted-foreground bg-muted/20">
                        Tidak ada catatan diff nilai spesifik untuk aksi ini.
                      </div>
                    )}
                  </div>
                ) : (
                  /* Task Specific Details */
                  <div className="space-y-3">
                    <div className="border rounded-lg p-3 bg-card space-y-2 text-xs">
                      <span className="text-[10px] text-muted-foreground block">Nama Task</span>
                      <p className="text-sm font-bold text-foreground">{selectedLog.taskName}</p>

                      {selectedLog.epicName && selectedLog.epicName !== "-" && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <span className="text-muted-foreground">Epic:</span>
                          <span className="inline-flex items-center gap-1 font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                            <Layers className="w-3 h-3" />
                            {selectedLog.epicName}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="border rounded-lg p-3 bg-card">
                        <span className="text-[10px] text-muted-foreground block">Estimasi MD</span>
                        <p className="text-base font-bold text-purple-600 dark:text-purple-400 mt-0.5">
                          {selectedLog.md} MD
                        </p>
                      </div>

                      <div className="border rounded-lg p-3 bg-card">
                        <span className="text-[10px] text-muted-foreground block">Rentang Jadwal</span>
                        <p className="font-semibold text-foreground mt-0.5">
                          {selectedLog.startDate || "-"} s/d {selectedLog.endDate || "-"}
                        </p>
                      </div>

                      <div className="border rounded-lg p-3 bg-card">
                        <span className="text-[10px] text-muted-foreground block">PIC Sebelum Klaim</span>
                        <p className="font-semibold text-foreground mt-0.5">
                          {selectedLog.previousPic || "Unassigned"}
                        </p>
                      </div>

                      <div className="border rounded-lg p-3 bg-card">
                        <span className="text-[10px] text-muted-foreground block">Status Sebelum Klaim</span>
                        <p className="font-semibold text-foreground mt-0.5">
                          {selectedLog.previousStatus || "TODO"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-3 bg-muted/20 border-t flex items-center justify-between shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDetailOpen(false)}
                  className="text-xs"
                >
                  Tutup
                </Button>

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setIsDetailOpen(false);
                    handleDeleteLog(selectedLog);
                  }}
                  className="text-xs gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Catatan Log</span>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
