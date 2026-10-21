"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
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
import { useCollection } from "@/hooks/use-firestore";
import { useAuth } from "@/components/auth-context";
import { TaskAssignmentLog } from "@/types/user-role";
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
} from "lucide-react";

export default function AssignmentLogsPage() {
  const { isSuperAdmin } = useAuth();

  const { data: rawLogs = [], isLoading, refetch, isFetching } = useCollection<TaskAssignmentLog>("assignmentLogs");
  const { data: projects = [] } = useCollection<any>("projects");

  const [localLogs, setLocalLogs] = useState<TaskAssignmentLog[]>([]);
  const [cacheSource, setCacheSource] = useState<"redis" | "firebase" | "loading">("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 15;

  // Active logs: prefer localLogs (which may come from fast Redis cache or fresh Firebase refetch)
  const activeLogs = useMemo(() => {
    return localLogs.length > 0 ? localLogs : rawLogs;
  }, [localLogs, rawLogs]);

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
          setLocalLogs(cached.logs);
          setCacheSource("redis");
          setLastRefreshedAt(new Date());
          setStatusMessage(`Berhasil memuat ${cached.logs.length} data log dari Redis Cache.`);
        } else {
          const res = await refetch();
          const fresh = res.data || [];
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
        const fresh = res.data || [];
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
          freshLogs = res.data || [];
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
            setLocalLogs(cached.logs);
            setCacheSource("redis");
            setLastRefreshedAt(new Date());
            setStatusMessage(`Data dimuat dari Redis Cache (${cached.logs.length} log).`);
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
      const q = searchQuery.toLowerCase().trim();
      const isSearchActive = q.length >= 3;
      const matchesSearch =
        !isSearchActive ||
        (log.taskName || "").toLowerCase().includes(q) ||
        (log.userName || "").toLowerCase().includes(q) ||
        (log.username || "").toLowerCase().includes(q) ||
        (log.epicName || "").toLowerCase().includes(q) ||
        (log.projectName || "").toLowerCase().includes(q);

      const matchesProject = projectFilter === "all" || log.projectId === projectFilter;
      const matchesUser =
        userFilter === "all" ||
        log.userId === userFilter ||
        log.username === userFilter;

      return matchesSearch && matchesProject && matchesUser;
    });
  }, [sortedLogs, searchQuery, projectFilter, userFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = useMemo(() => {
    const start = currentPage * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Metrics
  const metrics = useMemo(() => {
    const totalClaims = activeLogs.length;
    const totalMd = activeLogs.reduce((acc, l) => acc + (Number(l.md) || 0), 0);
    const uniqueClaimers = new Set(activeLogs.map((l) => l.userId || l.username)).size;

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentClaims = activeLogs.filter((l) => {
      const t = l.claimedAt?.toMillis ? l.claimedAt.toMillis() : new Date(l.timestamp || 0).getTime();
      return t >= sevenDaysAgo;
    }).length;

    return { totalClaims, totalMd, uniqueClaimers, recentClaims };
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

  // Format Task Date Range
  const formatDateRange = (start?: string, end?: string) => {
    if (!start) return "-";
    if (!end || end === start) return start;
    return `${start} s/d ${end}`;
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
            Task Claim Logs are reserved exclusively for the <strong>Master Administrator</strong>.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-4 p-4 sm:p-6 overflow-hidden">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-primary" />
              Task Claims (Logs)
            </h1>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Shield className="w-3 h-3" />
              Master Admin Only
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Riwayat lengkap seluruh task yang diambil oleh user melalui tombol <strong>Assign To Me</strong> beserta estimasi MD dan jadwalnya.
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
            className="p-1 text-primary/70 hover:text-primary rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium">Total Task Diklaim</p>
            <p className="text-lg font-bold text-foreground">{metrics.totalClaims}</p>
          </div>
        </div>

        <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium">Total MD Diambil</p>
            <p className="text-lg font-bold text-foreground">{metrics.totalMd.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">MD</span></p>
          </div>
        </div>

        <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <UsersIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium">User yang Mengklaim</p>
            <p className="text-lg font-bold text-foreground">{metrics.uniqueClaimers} <span className="text-xs font-normal text-muted-foreground">orang</span></p>
          </div>
        </div>

        <div className="p-3.5 rounded-lg border bg-card/60 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground font-medium">Klaim 7 Hari Terakhir</p>
            <p className="text-lg font-bold text-foreground">{metrics.recentClaims} <span className="text-xs font-normal text-muted-foreground">task</span></p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5 shrink-0 bg-muted/20 p-2.5 rounded-lg border">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Cari task, nama user, username, atau epic (min. 3 huruf)..."
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
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Project Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={projectFilter}
            onChange={(e) => {
              setProjectFilter(e.target.value);
              setCurrentPage(0);
            }}
            className="h-9 px-3 text-xs bg-background border rounded-md text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary w-full sm:w-44"
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
            className="h-9 px-3 text-xs bg-background border rounded-md text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary w-full sm:w-40"
          >
            <option value="all">Semua User</option>
            {uniqueUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <Panel className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <PanelContent className="p-0 flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-[160px]">Waktu Klaim</TableHead>
                <TableHead className="w-[180px]">User (Assignee)</TableHead>
                <TableHead className="w-[280px]">Task & Epic</TableHead>
                <TableHead className="w-[150px]">Project</TableHead>
                <TableHead className="w-[90px] text-center">MD</TableHead>
                <TableHead className="w-[200px]">Jadwal Pengerjaan</TableHead>
                <TableHead className="w-[200px]">Status Sebelum Klaim</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(isLoading && activeLogs.length === 0) || (cacheSource === "loading" && activeLogs.length === 0) ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-xs text-muted-foreground">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary opacity-70" />
                    Memuat catatan log dari {cacheSource === "redis" ? "Redis Cache" : "Firebase Firestore"}...
                  </TableCell>
                </TableRow>
              ) : paginatedLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                    <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold text-sm text-foreground">Belum ada log penugasan task.</p>
                    <p className="text-xs mt-1 max-w-sm mx-auto">
                      {searchQuery || projectFilter !== "all" || userFilter !== "all"
                        ? "Tidak ada log yang cocok dengan filter pencarian Anda."
                        : "Log akan otomatis tercatat ketika ada user yang mengklik tombol 'Assign To Me' pada task."}
                    </p>
                    {(searchQuery || projectFilter !== "all" || userFilter !== "all") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSearchQuery("");
                          setProjectFilter("all");
                          setUserFilter("all");
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
                  const targetProject = projects.find((p) => p.id === log.projectId);

                  return (
                    <TableRow key={log.id} className="hover:bg-muted/40 text-xs">
                      {/* Waktu Klaim */}
                      <TableCell className="font-medium text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 opacity-60" />
                          <span>{formatTimestamp(log)}</span>
                        </div>
                      </TableCell>

                      {/* User */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0">
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

                      {/* Task & Epic */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="font-medium text-foreground line-clamp-2">{log.taskName}</p>
                          {log.epicName && log.epicName !== "-" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded border">
                              <Layers className="w-3 h-3 text-primary" />
                              {log.epicName}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Project */}
                      <TableCell>
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border truncate max-w-[140px]"
                          style={{
                            borderColor: targetProject?.color ? `${targetProject.color}40` : "var(--border)",
                            backgroundColor: targetProject?.color ? `${targetProject.color}15` : "var(--muted)",
                            color: targetProject?.color || "inherit",
                          }}
                        >
                          <FolderKanban className="w-3 h-3 shrink-0" />
                          <span className="truncate">{log.projectName || targetProject?.name || "-"}</span>
                        </span>
                      </TableCell>

                      {/* MD */}
                      <TableCell className="text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                          {log.md} MD
                        </span>
                      </TableCell>

                      {/* Jadwal */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 font-medium text-foreground">
                            <span>{log.startDate || "-"}</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span>{log.endDate || "-"}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            Aksi:{" "}
                            <strong
                              className={
                                log.action === "BACK_TODO"
                                  ? "text-amber-600 dark:text-amber-400 font-bold"
                                  : "text-blue-600 dark:text-blue-400 font-bold"
                              }
                            >
                              {log.action === "BACK_TODO" ? "BACK TODO" : (log.status || "ON PROGRESS")}
                            </strong>
                          </span>
                        </div>
                      </TableCell>

                      {/* Status Sebelum Klaim */}
                      <TableCell>
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          <div className="flex items-center gap-1">
                            <span>PIC:</span>
                            <span className="font-medium text-foreground">{log.previousPic || "Unassigned"}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span>Status:</span>
                            <span className="px-1.5 py-0.2 rounded bg-muted text-[10px] font-semibold border">
                              {log.previousStatus || "TODO"}
                            </span>
                          </div>
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
              {Math.min((currentPage + 1) * pageSize, filteredLogs.length)} dari{" "}
              {filteredLogs.length} log
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
    </div>
  );
}
