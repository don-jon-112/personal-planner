"use client";

import React, { useState, useMemo } from "react";
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
import { useCollection } from "@/hooks/use-firestore";
import { useAuth } from "@/components/auth-context";
import { TaskAssignmentLog } from "@/types/user-role";
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
} from "lucide-react";

export default function AssignmentLogsPage() {
  const { isSuperAdmin } = useAuth();

  const { data: rawLogs = [], isLoading } = useCollection<TaskAssignmentLog>("assignmentLogs");
  const { data: projects = [] } = useCollection<any>("projects");

  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 15;

  // Sort logs: newest first
  const sortedLogs = useMemo(() => {
    return [...rawLogs].sort((a, b) => {
      const timeA = a.claimedAt?.toMillis ? a.claimedAt.toMillis() : new Date(a.timestamp || 0).getTime();
      const timeB = b.claimedAt?.toMillis ? b.claimedAt.toMillis() : new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });
  }, [rawLogs]);

  // Unique users list for filter
  const uniqueUsers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; username: string }>();
    rawLogs.forEach((l) => {
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
  }, [rawLogs]);

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
    const totalClaims = rawLogs.length;
    const totalMd = rawLogs.reduce((acc, l) => acc + (Number(l.md) || 0), 0);
    const uniqueClaimers = new Set(rawLogs.map((l) => l.userId || l.username)).size;

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentClaims = rawLogs.filter((l) => {
      const t = l.claimedAt?.toMillis ? l.claimedAt.toMillis() : new Date(l.timestamp || 0).getTime();
      return t >= sevenDaysAgo;
    }).length;

    return { totalClaims, totalMd, uniqueClaimers, recentClaims };
  }, [rawLogs]);

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
      </div>

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
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-xs text-muted-foreground">
                    Memuat catatan log...
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
                            Status: <strong className="text-blue-600 dark:text-blue-400">ON PROGRESS</strong>
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
