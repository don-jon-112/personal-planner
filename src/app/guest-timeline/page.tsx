"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { CalendarClock, ChevronDown, ChevronUp, ChevronRight, PieChart, Filter, RefreshCw, FileSpreadsheet, AlertTriangle, Eye, EyeOff, Lock, ShieldAlert } from "lucide-react";
import { useCollection } from "@/hooks/use-firestore";
import { ChartsDialog } from "../(dashboard)/timeline/charts-dialog";
import { Project } from "@/types/project";
import { cn } from "@/lib/utils";
import { computeAllTaskOverlaps, OverlapResult } from "@/lib/overlap-utils";
import { useAlertModal } from "@/components/confirm-dialog-provider";
import { enableNetwork, disableNetwork, getDocs, collection, terminate, clearIndexedDbPersistence } from "firebase/firestore";
import { db } from "@/firebase/config";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DateRangeFilter, DateRangeConfig, computeTimelineDates, getDatesInRange } from "../(dashboard)/timeline/date-range-filter";

// Helpers for dates
function getDayStatus(date: Date, holidays: any[] = []) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  
  if (holidays.some((h: any) => h.date === dateStr)) return 'holiday';
  if (date.getDay() === 0 || date.getDay() === 6) return 'weekend';
  return false;
}

function getTaskEndDate(startDate: Date, md: number, holidays: any[] = []): Date {
  let curr = new Date(startDate);
  curr.setHours(0, 0, 0, 0);
  let workingDays = 0;
  
  while (workingDays < md) {
    if (!getDayStatus(curr, holidays)) {
      workingDays++;
    }
    if (workingDays < md) {
      curr.setDate(curr.getDate() + 1);
    }
  }
  return curr;
}

function getPicColor(name: string, pics: any[] = []) {
  const pic = pics.find(p => p.name === name);
  if (pic && pic.color) return pic.color;

  if (!name) return "hsl(var(--primary))";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 50%)`;
}

function exportTimelineToExcel(epics: any[], tasks: any[], dates: Date[] = [], holidays: any[] = [], pics: any[] = [], showAlert?: (msg: string) => void) {
  if (!epics || epics.length === 0) {
    if (showAlert) showAlert("Tidak ada data Epic atau Task untuk diexport.");
    return;
  }

  const months: { name: string; days: number }[] = [];
  let currentMonth: string | null = null;
  let daysInMonth = 0;
  dates.forEach((d, i) => {
    const m = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    if (m !== currentMonth) {
      if (currentMonth) months.push({ name: currentMonth, days: daysInMonth });
      currentMonth = m;
      daysInMonth = 1;
    } else {
      daysInMonth++;
    }
    if (i === dates.length - 1) {
      months.push({ name: m, days: daysInMonth });
    }
  });

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8"/>
    <!--[if gte mso 9]>
    <xml>
      <x:ExcelWorkbook>
        <x:ExcelWorksheets>
          <x:ExcelWorksheet>
            <x:Name>Timeline Gantt</x:Name>
            <x:WorksheetOptions>
              <x:DisplayGridlines/>
            </x:WorksheetOptions>
          </x:ExcelWorksheet>
        </x:ExcelWorksheets>
      </x:ExcelWorkbook>
    </xml>
    <![endif]-->
    <style>
      table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 10pt; }
      th { background-color: #1e293b; color: #ffffff; font-weight: bold; border: 1px solid #94a3b8; padding: 6px; text-align: center; }
      td { border: 1px solid #cbd5e1; padding: 4px 6px; }
      .epic-row { background-color: #e2e8f0; font-weight: bold; font-size: 10pt; }
      .task-row { background-color: #ffffff; }
      .status-done { background-color: #dcfce7; color: #166534; font-weight: bold; text-align: center; }
      .status-review { background-color: #f3e8ff; color: #7e22ce; font-weight: bold; text-align: center; }
      .status-progress { background-color: #dbeafe; color: #1e40af; font-weight: bold; text-align: center; }
      .status-wontdo { background-color: #fee2e2; color: #991b1b; font-weight: bold; text-align: center; }
      .status-todo { background-color: #f1f5f9; color: #475569; font-weight: bold; text-align: center; }
      .center { text-align: center; }
      .number { text-align: right; }
      .date-col { width: 28px; text-align: center; font-size: 9pt; }
      .weekend-col { background-color: #e2e8f0; color: #64748b; }
      .holiday-col { background-color: #fca5a5; color: #991b1b; }
    </style>
  </head>
  <body>
    <table>
      <thead>
        <tr>
          <th colspan="7" style="background-color: #0f172a; text-align: left; font-size: 11pt;">Project Timeline & Schedule</th>
          ${months.map(m => `<th colspan="${m.days}" style="background-color: #334155;">${m.name}</th>`).join('')}
        </tr>
        <tr>
          <th>No</th>
          <th>Type</th>
          <th style="min-width: 220px; text-align: left;">Epic / Task Name</th>
          <th>PIC</th>
          <th>Status</th>
          <th>MD</th>
          <th>Start Date</th>
          ${dates.map(d => {
            const status = getDayStatus(d, holidays);
            const cls = status === 'holiday' ? 'holiday-col' : status === 'weekend' ? 'weekend-col' : '';
            return `<th class="date-col ${cls}">${d.getDate()}</th>`;
          }).join('')}
        </tr>
      </thead>
      <tbody>`;

  let rowNum = 1;
  const sortedEpics = [...epics].sort((a, b) => (a.order || 0) - (b.order || 0));

  sortedEpics.forEach(epic => {
    const epicTasks = tasks.filter(t => t.epicId === epic.id).sort((a, b) => (a.order || 0) - (b.order || 0));
    const doneCount = epicTasks.filter(t => t.status === "DONE").length;
    const pct = epicTasks.length ? Math.round((doneCount / epicTasks.length) * 100) : 0;
    const epicStatus = pct === 100 ? "DONE" : pct > 0 ? "ON PROGRESS" : "TODO";

    html += `<tr class="epic-row">
      <td class="center">${rowNum++}</td>
      <td class="center">EPIC</td>
      <td><strong>${epic.name} (${pct}%)</strong></td>
      <td class="center">-</td>
      <td class="${epicStatus === 'DONE' ? 'status-done' : epicStatus === 'ON PROGRESS' ? 'status-progress' : 'status-todo'}">${epicStatus} (${pct}%)</td>
      <td class="number">-</td>
      <td class="center">-</td>
      ${dates.map(d => {
        const status = getDayStatus(d, holidays);
        const style = status === 'holiday' ? 'background-color: #fca5a5;' : status === 'weekend' ? 'background-color: #cbd5e1;' : 'background-color: #e2e8f0;';
        return `<td style="${style}"></td>`;
      }).join('')}
    </tr>`;

    epicTasks.forEach(task => {
      const st = task.status || 'TODO';
      const stClass = st === 'DONE' ? 'status-done' : (st === 'IN REVIEW' || st === 'ON REVIEW') ? 'status-review' : st === 'ON PROGRESS' ? 'status-progress' : (st === "WON'T DO" || st === "WONT DO") ? 'status-wontdo' : 'status-todo';
      const picColor = getPicColor(task.pic, pics);

      const taskStart = new Date(task.startDate);
      taskStart.setHours(0,0,0,0);
      const startIndex = dates.findIndex(d => d.getTime() === taskStart.getTime());

      let activeDateSet = new Set<number>();
      if (startIndex !== -1 && task.md > 0) {
        let workingDays = 0;
        let currIdx = startIndex;
        while (workingDays < task.md && currIdx < dates.length) {
          activeDateSet.add(currIdx);
          const d = dates[currIdx];
          if (!getDayStatus(d, holidays)) {
            workingDays++;
          }
          if (workingDays < task.md) {
            currIdx++;
          }
        }
      }

      html += `<tr class="task-row">
        <td class="center">${rowNum++}</td>
        <td class="center">TASK</td>
        <td style="padding-left: 20px;">${task.name || ''}</td>
        <td class="center">${task.pic || '-'}</td>
        <td class="${stClass}">${st}</td>
        <td class="number">${task.md || 0}</td>
        <td class="center">${task.startDate || '-'}</td>
        ${dates.map((d, i) => {
          const isActive = activeDateSet.has(i);
          const status = getDayStatus(d, holidays);

          if (isActive) {
            return `<td style="background-color: ${picColor}; color: #ffffff; text-align: center; font-weight: bold;">■</td>`;
          } else if (status === 'holiday') {
            return `<td style="background-color: #fca5a5;"></td>`;
          } else if (status === 'weekend') {
            return `<td style="background-color: #e2e8f0;"></td>`;
          } else {
            return `<td></td>`;
          }
        }).join('')}
      </tr>`;
    });
  });

  html += `</tbody></table></body></html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  link.setAttribute("download", `Timeline_Gantt_Export_${dateStr}.xls`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function TaskText({ text, className }: { text: string, className?: string }) {
  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = React.useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const checkOverflow = () => {
      if (textRef.current) {
        setIsOverflowing(textRef.current.scrollWidth > textRef.current.clientWidth);
      }
    };
    checkOverflow();
    setTimeout(checkOverflow, 100);
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [text]);

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger render={<div className="w-full min-w-0 flex-1 overflow-hidden cursor-default" />}>
          <span ref={textRef} className={cn("w-full truncate block", className)}>
            {text}
          </span>
        </TooltipTrigger>
        {isOverflowing && (
          <TooltipContent side="top" align="start" className="z-[9999] max-w-[400px]">
            <p className="text-sm font-medium break-words">{text}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

function TaskRow({ task, dates, holidays, pics, overlapInfo }: { task: any, dates: Date[], holidays: any[], pics: any[], overlapInfo?: OverlapResult }) {
  const taskStart = new Date(task.startDate);
  taskStart.setHours(0,0,0,0);

  const hasOverlap = Boolean(overlapInfo?.hasOverlap);

  return (
    <div className="flex border-b hover:bg-muted/10 bg-background">
      <div className="w-[250px] md:sticky md:left-0 md:z-20 bg-background border-r shrink-0 flex items-center px-2 py-2 overflow-hidden">
        {hasOverlap && (
          <TooltipProvider delay={100}>
            <Tooltip>
              <TooltipTrigger className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/40 hover:bg-amber-500/25 transition-colors shrink-0 mr-1.5 cursor-help shadow-2xs select-none animate-pulse">
                <span>!!</span>
                <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              </TooltipTrigger>
              <TooltipContent side="right" align="start" className="z-[9999] p-3 max-w-[320px] bg-popover/95 backdrop-blur-sm border-amber-500/40 shadow-xl">
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Jadwal Overlap ({task.pic})</span>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    PIC <strong>{task.pic}</strong> memiliki {overlapInfo?.overlappingTasks.length} task lain di rentang tanggal yang sama:
                  </p>
                  <div className="space-y-1 pt-1 border-t border-border/50 max-h-36 overflow-y-auto">
                    {overlapInfo?.overlappingTasks.map((ot) => (
                      <div key={ot.id} className="bg-muted/50 p-1.5 rounded text-[11px] border border-border/40">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-foreground truncate">{ot.name}</span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-primary/10 text-primary font-bold">{ot.epicName}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{ot.startDate} s/d {ot.endDateStr} ({ot.md} MD) • {ot.status}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <TaskText text={task.name} className="text-sm font-medium text-secondary-foreground pl-1" />
      </div>
      <div className="w-[120px] md:sticky md:left-[250px] md:z-20 bg-background border-r shrink-0 flex items-center px-4 py-2 text-sm">
        {task.pic}
      </div>
      <div className="w-[120px] md:sticky md:left-[370px] md:z-20 bg-background border-r shrink-0 flex items-center justify-center px-2 py-2">
        <span className={cn(
          "text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider",
          task.status === "DONE" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
          task.status === "IN REVIEW" || task.status === "ON REVIEW" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
          task.status === "ON PROGRESS" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
          task.status === "WON'T DO" || task.status === "WONT DO" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" :
          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
        )}>
          {task.status || "TODO"}
        </span>
      </div>
      <div className="w-[60px] md:sticky md:left-[490px] md:z-20 bg-background border-r shrink-0 flex items-center justify-center px-2 py-2 text-sm font-mono">
        {task.md}
      </div>

      {/* Grid Cells */}
      <div className="flex relative">
        {dates.map((date, i) => {
          const status = getDayStatus(date, holidays);
          return (
            <div 
              key={date.toISOString()} 
              className={cn(
                "w-[40px] shrink-0 border-r relative",
                status === 'holiday' ? "bg-red-400/80 z-10" : 
                status === 'weekend' ? "bg-black/80 z-10" : ""
              )}
            />
          );
        })}
        {/* Task Bar */}
        {(() => {
          if (!dates || dates.length === 0) return null;
          if (!task.startDate || task.startDate === 'TBD') return null;
          const taskStart = new Date(task.startDate);
          if (isNaN(taskStart.getTime())) return null;
          taskStart.setHours(0,0,0,0);

          const visibleStart = dates[0].getTime();
          const visibleEnd = dates[dates.length - 1].getTime();
          
          const taskEnd = getTaskEndDate(taskStart, task.md, holidays);
          const taskEndTime = taskEnd.getTime();
          const taskStartTime = taskStart.getTime();

          if (taskEndTime < visibleStart || taskStartTime > visibleEnd) {
            return null;
          }

          let startIndex = dates.findIndex(d => d.getTime() === taskStartTime);
          if (startIndex === -1 && taskStartTime >= visibleStart) {
            startIndex = dates.findIndex(d => d.getTime() > taskStartTime);
          }
          if (startIndex === -1) startIndex = 0;

          let endIndex = dates.findIndex(d => d.getTime() === taskEndTime);
          if (endIndex === -1 && taskEndTime <= visibleEnd) {
            for (let k = dates.length - 1; k >= 0; k--) {
              if (dates[k].getTime() <= taskEndTime) {
                endIndex = k;
                break;
              }
            }
          }
          if (endIndex === -1) endIndex = dates.length - 1;

          if (startIndex > endIndex) return null;

          const barWidthDays = (endIndex - startIndex + 1);

          return (
            <div 
              className={cn(
                "absolute top-2 h-[60%] shadow-sm pointer-events-none border border-black/10 z-0 flex items-center justify-end px-1",
                taskStartTime < visibleStart ? "rounded-l-none" : "rounded-l",
                taskEndTime > visibleEnd ? "rounded-r-none" : "rounded-r",
                hasOverlap && "ring-2 ring-amber-500/80 ring-offset-0"
              )}
              style={{
                left: `${startIndex * 40}px`,
                width: `${barWidthDays * 40}px`,
                backgroundColor: getPicColor(task.pic, pics),
              }}
            >
              {hasOverlap && barWidthDays >= 1 && (
                <span className="text-[9px] font-black text-amber-200 bg-black/50 px-1 py-0.2 rounded shadow-2xs tracking-tighter" title="Overlap Task">
                  !!
                </span>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function EpicGroup({ epic, tasks, dates, holidays, pics, overlapMap, collapseAllTrigger, expandAllTrigger }: any) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  useEffect(() => {
    if (collapseAllTrigger > 0) setIsExpanded(false);
  }, [collapseAllTrigger]);

  useEffect(() => {
    if (expandAllTrigger > 0) setIsExpanded(true);
  }, [expandAllTrigger]);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t: any) => t.status === "DONE").length;
  const activeTasks = tasks.filter((t: any) => t.status !== "WON'T DO" && t.status !== "WONT DO").length;
  const percentage = activeTasks === 0 ? (totalTasks > 0 ? 100 : 0) : Math.round((doneTasks / activeTasks) * 100);

  return (
    <div className="flex flex-col bg-card">
      <div 
        className="flex border-b bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="w-[550px] md:sticky md:left-0 md:z-20 bg-muted border-r shrink-0 flex items-center px-2 py-2">
          <button className="mr-1 ml-2 text-muted-foreground hover:text-foreground focus:outline-none p-1">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <TaskText text={epic.name} className="font-bold text-sm uppercase tracking-wider text-foreground" />
          <span className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full ml-2",
            percentage === 100 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
            percentage > 0 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
            "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
          )}>
            {percentage}%
          </span>
        </div>
        
        {/* Empty cells for epic row */}
        <div className="flex">
          {dates.map((date: Date) => {
            const status = getDayStatus(date, holidays);
            return (
              <div key={date.toISOString()} className={cn("w-[40px] shrink-0 border-r", status === 'holiday' ? "bg-red-400/90" : status === 'weekend' ? "bg-black/90" : "")} />
            );
          })}
        </div>
      </div>
      
      {/* Task List inside this Epic */}
      {isExpanded && (
        <div className="flex flex-col min-h-[10px]">
          {tasks.map((task: any) => (
            <TaskRow 
              key={task.id} 
              task={task} 
              dates={dates} 
              holidays={holidays}
              pics={pics}
              overlapInfo={overlapMap?.get(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GuestTimelineInner() {
  const alertModal = useAlertModal();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const projectIdParam = searchParams.get("project") || searchParams.get("projectId");

  const { data: rawEpics, isLoading: isLoadingEpics, refetch: refetchEpics } = useCollection<any>("timelineEpics");
  const { data: rawTasks, isLoading: isLoadingTasks, refetch: refetchTasks } = useCollection<any>("timelineTasks");
  const { data: holidays, refetch: refetchHolidays } = useCollection<any>("timelineHolidays");
  const { data: pics, refetch: refetchPics } = useCollection<any>("timelinePics");
  const { data: projects, isLoading: isLoadingProjects } = useCollection<Project>("projects");

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Match project by token or projectIdParam
  const matchedProject = useMemo(() => {
    if (!projects || projects.length === 0) return null;
    if (token) {
      return projects.find((p) => p.shareSettings?.shareToken === token) || null;
    }
    if (projectIdParam) {
      return projects.find((p) => p.id === projectIdParam) || null;
    }
    return projects[0] || null;
  }, [projects, token, projectIdParam]);

  const isInvalidToken = Boolean(
    token && !isLoadingProjects && (!matchedProject || matchedProject.shareSettings?.isEnabled === false)
  );

  useEffect(() => {
    const checkPendingSync = async () => {
      if (localStorage.getItem('pendingSyncDown') === 'true') {
        localStorage.removeItem('pendingSyncDown');
        setIsRefreshing(true);
        try {
          await enableNetwork(db);
          // Just fetch the timeline collections
          const timelineCols = ["timelineEpics", "timelineTasks", "timelineHolidays", "timelinePics"];
          const fetchPromises = timelineCols.map(col => getDocs(collection(db, col)));
          await Promise.all(fetchPromises);
          await queryClient.invalidateQueries();
          if (localStorage.getItem('syncMode') !== 'online') {
            await disableNetwork(db);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setIsRefreshing(false);
        }
      }
    };
    checkPendingSync();
  }, [queryClient]);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await terminate(db);
      await clearIndexedDbPersistence(db);
      localStorage.setItem('pendingSyncDown', 'true');
      window.location.reload();
    } catch (e) {
      console.error(e);
      setIsRefreshing(false);
    }
  };

  const [isChartsDialogOpen, setIsChartsDialogOpen] = useState(false);
  const [collapseAllTrigger, setCollapseAllTrigger] = useState(0);
  const [expandAllTrigger, setExpandAllTrigger] = useState(0);
  
  const [orderedEpics, setOrderedEpics] = useState<any[]>([]);
  const [localTasks, setLocalTasks] = useState<any[]>([]);
  const [selectedPicFilter, setSelectedPicFilter] = useState<string>("ALL");

  const filteredOrderedEpics = useMemo(() => {
    if (selectedPicFilter === "ALL") return orderedEpics;
    return orderedEpics.filter(epic => 
      localTasks.some(t => t.epicId === epic.id && t.pic === selectedPicFilter)
    );
  }, [orderedEpics, localTasks, selectedPicFilter]);

  // Scope Epics to matchedProject
  useEffect(() => {
    if (rawEpics && matchedProject) {
      const filtered = rawEpics.filter((e: any) => {
        if (e.projectId) return e.projectId === matchedProject.id;
        return matchedProject.isDefault || matchedProject.id === projects?.[0]?.id;
      });
      setOrderedEpics(filtered.sort((a, b) => (a.order || 0) - (b.order || 0)));
    } else if (rawEpics && !token && !projectIdParam) {
      setOrderedEpics([...rawEpics].sort((a, b) => (a.order || 0) - (b.order || 0)));
    }
  }, [rawEpics, matchedProject, projects, token, projectIdParam]);

  // Scope Tasks to matchedProject
  useEffect(() => {
    if (rawTasks && matchedProject) {
      const filtered = rawTasks.filter((t: any) => {
        if (t.projectId) return t.projectId === matchedProject.id;
        return matchedProject.isDefault || matchedProject.id === projects?.[0]?.id;
      });
      setLocalTasks(filtered.sort((a, b) => (a.order || 0) - (b.order || 0)));
    } else if (rawTasks && !token && !projectIdParam) {
      setLocalTasks([...rawTasks].sort((a, b) => (a.order || 0) - (b.order || 0)));
    }
  }, [rawTasks, matchedProject, projects, token, projectIdParam]);

  const [rangeConfig, setRangeConfig] = useState<DateRangeConfig>({ preset: "auto" });
  const [showNonWorkingDays, setShowNonWorkingDays] = useState(true);

  const rawDates = useMemo(() => {
    return computeTimelineDates(rangeConfig, localTasks);
  }, [rangeConfig, localTasks]);

  const dates = useMemo(() => {
    if (showNonWorkingDays) return rawDates;
    return rawDates.filter(d => !getDayStatus(d, holidays));
  }, [rawDates, showNonWorkingDays, holidays]);

  const overlapMap = useMemo(() => {
    return computeAllTaskOverlaps(localTasks, holidays, orderedEpics);
  }, [localTasks, holidays, orderedEpics]);

  if (isInvalidToken) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-2xl border bg-card text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Akses Tidak Tersedia</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Tautan timeline ini telah dinonaktifkan oleh Project Manager atau sudah tidak berlaku lagi.
            Silakan hubungi pengelola project untuk mendapatkan tautan akses terbaru.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Panel className="h-[calc(100dvh-104px)] min-h-0 border-t-4 border-t-primary flex flex-col">
      <PanelHeader className="flex flex-col xl:flex-row items-start justify-between border-b-0 pb-3 gap-4 shrink-0">
        <div className="w-full xl:w-auto">
          <PanelTitle className="text-2xl font-bold text-secondary-foreground flex items-center gap-2 flex-wrap">
            <CalendarClock className="w-6 h-6 text-primary" />
            <span>{matchedProject ? matchedProject.name : "Timeline"}</span>
            {matchedProject && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5 ml-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: matchedProject.color || "#3b82f6" }}
                />
                {matchedProject.key || "Project"}
              </span>
            )}
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
              Read-Only
            </span>
          </PanelTitle>
          <PanelDescription className="mt-1">
            {matchedProject?.description || "Read-only view of the project schedule."}
          </PanelDescription>
        </div>

        <div className="flex flex-col gap-2.5 w-full xl:w-auto items-start xl:items-end">
          {/* Row 1: Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-start xl:justify-end">
            <Button 
              onClick={() => setShowNonWorkingDays(!showNonWorkingDays)} 
              variant="outline" 
              className={cn("px-3 text-xs sm:text-sm", !showNonWorkingDays && "bg-primary/10 border-primary text-primary")}
            >
              {showNonWorkingDays ? (
                <>
                  <EyeOff className="w-4 h-4 mr-1.5" />
                  <span>Hide Holidays & Weekends</span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-1.5" />
                  <span>Show Holidays & Weekends</span>
                </>
              )}
            </Button>
            <Button onClick={() => exportTimelineToExcel(orderedEpics, localTasks, dates, holidays, pics, (msg) => alertModal({ title: "Export Excel", description: msg, variant: "info" }))} variant="outline" className="px-3 text-xs sm:text-sm">
              <FileSpreadsheet className="w-4 h-4 mr-1.5 text-green-600 dark:text-green-500" />
              <span className="hidden sm:inline">Export Excel</span>
              <span className="sm:hidden">Excel</span>
            </Button>
            <Button onClick={() => setIsChartsDialogOpen(true)} variant="outline" className="px-3 text-xs sm:text-sm">
              <PieChart className="w-4 h-4 mr-1.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Analytics</span>
            </Button>
            <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline" className="px-3 text-xs sm:text-sm">
              <RefreshCw className={cn("w-4 h-4 mr-1.5", isRefreshing && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
              <span className="sm:hidden">Sync</span>
            </Button>
            <ChartsDialog open={isChartsDialogOpen} onOpenChange={setIsChartsDialogOpen} tasks={localTasks} pics={pics} />
          </div>

          {/* Row 2: Filter Toolbar on desktop */}
          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-start xl:justify-end bg-muted/40 p-1.5 rounded-lg border border-border/60">
            <span className="text-xs font-semibold text-muted-foreground px-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-primary" /> Filter:
            </span>
            <DateRangeFilter rangeConfig={rangeConfig} onChange={setRangeConfig} tasks={localTasks} />
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "px-3 h-8 text-xs font-medium")}>
                <span>{selectedPicFilter === "ALL" ? "All PICs" : selectedPicFilter}</span>
                <ChevronDown className="w-3.5 h-3.5 ml-1.5 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Filter by PIC</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem 
                    checked={selectedPicFilter === "ALL"}
                    onCheckedChange={() => setSelectedPicFilter("ALL")}
                  >
                    All PICs
                  </DropdownMenuCheckboxItem>
                  {[...(pics || [])].sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")).map((pic: any) => (
                    <DropdownMenuCheckboxItem 
                      key={pic.id}
                      checked={selectedPicFilter === pic.name}
                      onCheckedChange={() => setSelectedPicFilter(pic.name)}
                    >
                      {pic.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </PanelHeader>

      <PanelContent className="flex-1 overflow-hidden p-0 flex flex-col m-6 border rounded-lg shadow-sm">
        {(isLoadingEpics || isLoadingTasks) ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading timeline...</div>
        ) : orderedEpics.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-muted-foreground border-dashed border-2 rounded-lg m-4">
            <CalendarClock className="w-12 h-12 mb-4 opacity-20" />
            <p>No Epics found.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-card relative custom-scrollbar">
            <div className="min-w-max flex flex-col">
              
              <div className="flex flex-col sticky top-0 z-30 shadow-sm bg-background">
                {/* Month Row */}
                <div className="flex bg-muted border-b">
                  <div className="w-[550px] md:sticky md:left-0 md:z-40 bg-muted border-r shrink-0" />
                  <div className="flex">
                    {(() => {
                      const months: { name: string, days: number }[] = [];
                      let currentMonth: string | null = null;
                      let daysInMonth = 0;
                      dates.forEach((d, i) => {
                        const m = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                        if (m !== currentMonth) {
                          if (currentMonth) months.push({ name: currentMonth, days: daysInMonth });
                          currentMonth = m;
                          daysInMonth = 1;
                        } else {
                          daysInMonth++;
                        }
                        if (i === dates.length - 1) {
                          months.push({ name: m, days: daysInMonth });
                        }
                      });
                      return months.map(m => (
                         <div key={m.name} style={{ width: m.days * 40 }} className="shrink-0 border-r text-center text-xs font-bold py-1 text-muted-foreground uppercase tracking-wider">
                          {m.name}
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Days Row */}
                <div className="flex bg-muted border-b">
                  <div className="w-[250px] md:sticky md:left-0 md:z-40 bg-muted border-r shrink-0 px-4 py-2 font-semibold text-sm uppercase tracking-wider flex items-center">Epic / Task</div>
                  <div className="w-[120px] md:sticky md:left-[250px] md:z-40 bg-muted border-r shrink-0 px-4 py-2 font-semibold text-sm uppercase tracking-wider flex items-center">PIC</div>
                  <div className="w-[120px] md:sticky md:left-[370px] md:z-40 bg-muted border-r shrink-0 px-4 py-2 font-semibold text-sm uppercase tracking-wider flex items-center justify-center">Status</div>
                  <div className="w-[60px] md:sticky md:left-[490px] md:z-40 bg-muted border-r shrink-0 px-1 py-1 font-semibold text-sm uppercase tracking-wider flex items-center justify-center gap-1">
                    MD
                    <div className="flex flex-col items-center justify-center">
                      <button onClick={() => setCollapseAllTrigger(prev => prev + 1)} title="Collapse All" className="hover:bg-muted-foreground/10 rounded"><ChevronUp className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground"/></button>
                      <button onClick={() => setExpandAllTrigger(prev => prev + 1)} title="Expand All" className="hover:bg-muted-foreground/10 rounded"><ChevronDown className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground"/></button>
                    </div>
                  </div>
                  
                  <div className="flex">
                    {dates.map((date) => {
                      const isToday = date.toDateString() === new Date().toDateString();
                      const status = getDayStatus(date, holidays);
                      return (
                        <div 
                          key={date.toISOString()} 
                          className={cn(
                            "w-[40px] shrink-0 border-r flex flex-col items-center justify-center py-1 text-xs select-none",
                            status === 'holiday' ? "bg-red-400 text-white" : status === 'weekend' ? "bg-black text-white" : "",
                            isToday && !status && "bg-primary/10 text-primary font-bold"
                          )}
                        >
                          <span className={cn("font-medium", status ? "text-white/90" : (isToday ? "text-primary" : "text-muted-foreground"))}>{date.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
                          <span>{date.getDate()}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex flex-col">
                {filteredOrderedEpics.map((epic) => {
                  let epicTasks = localTasks.filter(t => t.epicId === epic.id);
                  if (selectedPicFilter !== "ALL") {
                    epicTasks = epicTasks.filter(t => t.pic === selectedPicFilter);
                  }
                  return (
                    <EpicGroup
                      key={epic.id}
                      epic={epic}
                      tasks={epicTasks}
                      dates={dates}
                      holidays={holidays}
                      pics={pics || []}
                      overlapMap={overlapMap}
                      collapseAllTrigger={collapseAllTrigger}
                      expandAllTrigger={expandAllTrigger}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </PanelContent>
    </Panel>
  );
}

export default function GuestTimelinePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center text-muted-foreground text-sm">
          Loading timeline...
        </div>
      }
    >
      <GuestTimelineInner />
    </Suspense>
  );
}

