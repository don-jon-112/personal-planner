"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Plus,
  GripVertical,
  MoreHorizontal,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  PieChart,
  Filter,
  FileSpreadsheet,
  AlertTriangle,
  Eye,
  Download,
  Share2,
  Calendar,
  Lock,
  Search,
  X,
  UserCheck,
  ClipboardCheck,
  RotateCcw,
  Database,
  Zap,
  Layers,
} from "lucide-react";
import { serverTimestamp } from "firebase/firestore";
import { fetchCachedTimelineData, saveProjectCacheToRedis, appendAssignmentLogToRedis } from "@/lib/cache-client";
import { useCollection, useDeleteDocument, useUpdateDocument, useAddDocument } from "@/hooks/use-firestore";
import { EpicDialog } from "./epic-dialog";
import { TaskDialog } from "./task-dialog";
import { AssignToMeDialog } from "@/components/assign-to-me-dialog";
import { HolidaysDialog } from "./holidays-dialog";
import { PicsDialog } from "./pics-dialog";
import dynamic from "next/dynamic";

const ChartsDialog = dynamic(
  () => import("./charts-dialog").then((m) => m.ChartsDialog),
  { ssr: false }
);
const TimelineExportDialog = dynamic(
  () => import("./timeline-export-dialog").then((m) => m.TimelineExportDialog),
  { ssr: false }
);
import { ProjectShareDialog } from "@/components/project-share-dialog";
import { cn } from "@/lib/utils";
import { computeAllTaskOverlaps, OverlapResult } from "@/lib/overlap-utils";
import { useConfirm, useAlertModal } from "@/components/confirm-dialog-provider";
import { useTaskStatuses, isStatusDone } from "@/hooks/use-task-statuses";
import { usePermissions } from "@/hooks/use-permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { DateRangeFilter, DateRangeConfig, computeTimelineDates } from "./date-range-filter";
import { useProject } from "@/components/project-context";
import { useAuth } from "@/components/auth-context";

// -------------------------------------------------------------
// COLUMN DEFINITIONS & RESIZING CONSTANTS
// -------------------------------------------------------------

interface ColWidths {
  task: number;
  pic: number;
  status: number;
  priority: number;
  md: number;
  actions: number;
}

const DEFAULT_COL_WIDTHS: ColWidths = {
  task: 250,
  pic: 120,
  status: 120,
  priority: 45,
  md: 60,
  actions: 50,
};

const COL_LIMITS = {
  task: { min: 150, max: 600 },
  pic: { min: 80, max: 220 },
  status: { min: 80, max: 200 },
};

function computeOffsets(widths: ColWidths) {
  const task = 0;
  const pic = widths.task;
  const status = pic + widths.pic;
  const priority = status + widths.status;
  const md = priority + (widths.priority ?? DEFAULT_COL_WIDTHS.priority);
  const actions = md + widths.md;
  const totalHeader = actions + widths.actions;
  const epicTitle = actions; // Epic title spans task + pic + status + priority + md (up to actions column)
  return { task, pic, status, priority, md, actions, totalHeader, epicTitle };
}

// -------------------------------------------------------------
// HELPERS FOR DATES
// -------------------------------------------------------------

function getDayStatus(date: Date, holidays: any[] = []) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  
  if (holidays.some((h: any) => h.date === dateStr)) return 'holiday';
  if (date.getDay() === 0 || date.getDay() === 6) return 'weekend';
  return false;
}

function getTaskEndDate(startDate: Date, md: number, holidays: any[] = [], isOvertime: boolean = false): Date {
  let curr = new Date(startDate);
  curr.setHours(0, 0, 0, 0);
  let workingDays = 0;
  const validMd = Math.max(1, Math.ceil(Number(md) || 1));
  
  while (workingDays < validMd) {
    if (isOvertime || !getDayStatus(curr, holidays)) {
      workingDays++;
    }
    if (workingDays < validMd) {
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
    if (showAlert) showAlert("No Epic or Task data available to export.");
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

      const isOvertime = Boolean(task.isOvertime || task.overtime);
      let activeDateSet = new Set<number>();
      const targetMd = Math.ceil(parseFloat(task.md) || 0);
      if (startIndex !== -1 && targetMd > 0) {
        let workingDays = 0;
        let currIdx = startIndex;
        while (workingDays < targetMd && currIdx < dates.length) {
          const d = dates[currIdx];
          const isOffDay = Boolean(getDayStatus(d, holidays));
          if (isOvertime || !isOffDay) {
            activeDateSet.add(currIdx);
            workingDays++;
          }
          if (workingDays < targetMd) {
            currIdx++;
          }
        }
      }

      html += `<tr class="task-row">
        <td class="center">${rowNum++}</td>
        <td class="center">TASK</td>
        <td style="padding-left: 20px;">${task.name || ''}${isOvertime ? ' (OT)' : ''}</td>
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

// -------------------------------------------------------------
// UI COMPONENTS
// -------------------------------------------------------------

function TaskText({ text, className }: { text: string; className?: string }) {
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

// Resize handle component for table headers
function ColumnResizeHandle({
  onMouseDown,
  onDoubleClick,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize, double-click to reset"
      className="absolute right-0 top-0 bottom-0 w-3 cursor-col-resize select-none flex items-center justify-center group z-50 hover:bg-primary/20 active:bg-primary/40 transition-colors"
    >
      <div className="w-[1.5px] h-4 bg-muted-foreground/40 group-hover:bg-primary transition-colors rounded-full" />
    </div>
  );
}

const TaskRow = React.memo(function TaskRow({
  task,
  dates,
  holidays,
  pics,
  overlapInfo,
  onEdit,
  onDelete,
  onUpdateStatus,
  onAssignToMe,
  onSetInReview,
  onBackToTodo,
  hasEdit = true,
  hasDelete = true,
  taskStatuses = [],
  getStatusColor,
  colWidths,
  offsets,
}: {
  task: any;
  dates: Date[];
  holidays?: any[];
  pics: any[];
  overlapInfo?: OverlapResult;
  onEdit: any;
  onDelete: any;
  onUpdateStatus: any;
  onAssignToMe?: (task: any) => void;
  onSetInReview?: (task: any) => void;
  onBackToTodo?: (task: any) => void;
  hasEdit?: boolean;
  hasDelete?: boolean;
  taskStatuses?: any[];
  getStatusColor?: (name: string) => string;
  colWidths: ColWidths;
  offsets: ReturnType<typeof computeOffsets>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { type: "Task", task }, disabled: !hasEdit });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const hasOverlap = Boolean(overlapInfo?.hasOverlap);
  const normalizedStatus = (task.status || "TODO").trim().toUpperCase();
  const isTodo = normalizedStatus === "TODO";
  const isOnProgress = normalizedStatus === "ON PROGRESS" || normalizedStatus === "IN PROGRESS";

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={cn("content-visibility-auto flex border-b hover:bg-muted/10 bg-background", isDragging && "z-50 relative")}
    >
      {/* 1. Epic / Task Name Column */}
      <div
        style={{ width: `${colWidths.task}px` }}
        className="md:sticky md:left-0 md:z-20 bg-background border-r shrink-0 flex items-center px-2 py-2 overflow-hidden"
      >
        {hasEdit ? (
          <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground mr-1 p-1 z-10 bg-background">
            <GripVertical className="w-4 h-4" />
          </div>
        ) : (
          <div className="w-1.5 shrink-0 mr-1" />
        )}
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
        {Boolean(task.isOvertime || task.overtime) && (
          <span
            className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0 ml-1.5 select-none"
            title="Overtime Task (Lembur - weekend/libur dihitung)"
          >
            OT
          </span>
        )}
      </div>

      {/* 2. PIC Column */}
      <div
        style={{ width: `${colWidths.pic}px`, left: `${offsets.pic}px` }}
        className="md:sticky md:z-20 bg-background border-r shrink-0 flex items-center px-4 py-2 text-sm overflow-hidden"
      >
        <span className="truncate">{task.pic || "-"}</span>
      </div>

      {/* 3. Status Column */}
      <div
        style={{ width: `${colWidths.status}px`, left: `${offsets.status}px` }}
        className="md:sticky md:z-20 bg-background border-r shrink-0 flex items-center justify-center px-2 py-2 overflow-hidden"
      >
        {hasEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="focus:outline-none cursor-pointer">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider truncate max-w-full block hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: `${getStatusColor ? getStatusColor(task.status) : "#94a3b8"}20`,
                  color: getStatusColor ? getStatusColor(task.status) : "#94a3b8",
                  border: `1px solid ${getStatusColor ? getStatusColor(task.status) : "#94a3b8"}50`,
                }}
              >
                {task.status || "TODO"}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {taskStatuses.map((s: any) => (
                <DropdownMenuItem key={s.id} onClick={() => onUpdateStatus(task.id, s.name)}>
                  <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: s.color }} />
                  {s.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider truncate max-w-full block cursor-default select-none"
            style={{
              backgroundColor: `${getStatusColor ? getStatusColor(task.status) : "#94a3b8"}20`,
              color: getStatusColor ? getStatusColor(task.status) : "#94a3b8",
              border: `1px solid ${getStatusColor ? getStatusColor(task.status) : "#94a3b8"}50`,
            }}
          >
            {task.status || "TODO"}
          </span>
        )}
      </div>

      {/* 3b. Priority Column */}
      <div
        style={{ width: `${colWidths.priority ?? DEFAULT_COL_WIDTHS.priority}px`, left: `${offsets.priority}px` }}
        className="md:sticky md:z-20 bg-background border-r shrink-0 flex items-center justify-center px-1 py-2 text-xs font-mono overflow-hidden"
      >
        {task.priority !== undefined && task.priority !== null && task.priority !== "" ? (
          <span
            className="font-bold text-[11px] px-1.5 py-0.5 rounded bg-muted/80 text-foreground border border-border/60"
            title={`Priority ${task.priority}`}
          >
            P{task.priority}
          </span>
        ) : (
          <span className="text-muted-foreground/40 text-xs">-</span>
        )}
      </div>

      {/* 4. MD Column */}
      <div
        style={{ width: `${colWidths.md}px`, left: `${offsets.md}px` }}
        className="md:sticky md:z-20 bg-background border-r shrink-0 flex items-center justify-center px-2 py-2 text-sm font-mono overflow-hidden"
      >
        {task.md}
      </div>

      {/* 5. Actions Column */}
      <div
        style={{ width: `${colWidths.actions}px`, left: `${offsets.actions}px` }}
        className="md:sticky md:z-20 bg-background border-r shrink-0 flex items-center justify-center px-2 py-2 overflow-hidden"
      >
        <DropdownMenu>
          <DropdownMenuTrigger className="p-1 text-muted-foreground hover:text-foreground rounded">
            <MoreHorizontal className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {hasEdit ? (
              <>
                <DropdownMenuItem onClick={() => onEdit(task)}>Edit Task</DropdownMenuItem>
                {isTodo && onAssignToMe && (
                  <DropdownMenuItem
                    className="text-primary font-medium focus:text-primary cursor-pointer"
                    onClick={() => onAssignToMe(task)}
                  >
                    <UserCheck className="w-4 h-4 mr-2" />
                    <span>Assign To Me</span>
                  </DropdownMenuItem>
                )}
                {isOnProgress && onSetInReview && (
                  <DropdownMenuItem
                    className="text-purple-600 dark:text-purple-400 font-medium focus:text-purple-600 cursor-pointer"
                    onClick={() => onSetInReview(task)}
                  >
                    <ClipboardCheck className="w-4 h-4 mr-2" />
                    <span>IN REVIEW</span>
                  </DropdownMenuItem>
                )}
                {isOnProgress && onBackToTodo && (
                  <DropdownMenuItem
                    className="text-amber-600 dark:text-amber-400 font-medium focus:text-amber-600 cursor-pointer"
                    onClick={() => onBackToTodo(task)}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    <span>BACK TODO</span>
                  </DropdownMenuItem>
                )}
                {hasDelete && (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(task)}>
                    Delete
                  </DropdownMenuItem>
                )}
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={() => onEdit(task)}>
                  View Task Details
                </DropdownMenuItem>
                {isTodo && onAssignToMe && (
                  <DropdownMenuItem
                    className="text-primary font-medium focus:text-primary cursor-pointer"
                    onClick={() => onAssignToMe(task)}
                  >
                    <UserCheck className="w-4 h-4 mr-2" />
                    <span>Assign To Me</span>
                  </DropdownMenuItem>
                )}
                {isOnProgress && onSetInReview && (
                  <DropdownMenuItem
                    className="text-purple-600 dark:text-purple-400 font-medium focus:text-purple-600 cursor-pointer"
                    onClick={() => onSetInReview(task)}
                  >
                    <ClipboardCheck className="w-4 h-4 mr-2" />
                    <span>IN REVIEW</span>
                  </DropdownMenuItem>
                )}
                {isOnProgress && onBackToTodo && (
                  <DropdownMenuItem
                    className="text-amber-600 dark:text-amber-400 font-medium focus:text-amber-600 cursor-pointer"
                    onClick={() => onBackToTodo(task)}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    <span>BACK TODO</span>
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Grid Cells */}
      <div className="flex relative">
        {dates.map((date) => {
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
          
          const isOvertime = Boolean(task.isOvertime || task.overtime);
          const taskEnd = getTaskEndDate(taskStart, task.md, holidays, isOvertime);
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
                "absolute top-2 h-[60%] shadow-sm pointer-events-none border border-black/10 flex items-center justify-end px-1",
                isOvertime ? "z-20 ring-1 ring-amber-400/90 shadow-md" : "z-0",
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
              {isOvertime && (
                <span className="text-[9px] font-black text-amber-300 bg-black/60 px-1 py-0.2 rounded shadow-2xs mr-1 tracking-tighter" title="Overtime Task (Lembur)">
                  OT
                </span>
              )}
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
});

// Epic Segment on current page (supports continuation headers)
interface EpicSegment {
  key: string;
  epic: any;
  isContinuation: boolean;
  tasks: any[];
  allEpicTasks: any[];
}

const EpicSegmentGroup = React.memo(function EpicSegmentGroup({
  segment,
  dates,
  holidays,
  pics,
  overlapMap,
  isExpanded,
  onToggleExpand,
  onEditEpic,
  onDeleteEpic,
  onEditTask,
  onDeleteTask,
  onUpdateTaskStatus,
  onAddTaskToEpic,
  onAssignToMe,
  onSetInReview,
  onBackToTodo,
  hasEdit = true,
  hasDelete = true,
  taskStatuses,
  getStatusColor,
  colWidths,
  offsets,
}: {
  segment: EpicSegment;
  dates: Date[];
  holidays?: any[];
  pics: any[];
  overlapMap?: Map<string, OverlapResult>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEditEpic: any;
  onDeleteEpic: any;
  onEditTask: any;
  onDeleteTask: any;
  onUpdateTaskStatus: any;
  onAddTaskToEpic: any;
  onAssignToMe?: (task: any) => void;
  onSetInReview?: (task: any) => void;
  onBackToTodo?: (task: any) => void;
  hasEdit?: boolean;
  hasDelete?: boolean;
  taskStatuses: any[];
  getStatusColor?: (name: string) => string;
  colWidths: ColWidths;
  offsets: ReturnType<typeof computeOffsets>;
}) {
  const { epic, isContinuation, tasks, allEpicTasks } = segment;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: epic.id,
    data: { type: "Epic", epic },
    disabled: isContinuation || !hasEdit, // Continuation headers don't reorder the epic, also disabled for read-only
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const totalTasks = allEpicTasks.length;
  const doneTasks = allEpicTasks.filter((t: any) => isStatusDone(t.status, taskStatuses)).length;
  const activeTasks = allEpicTasks.filter((t: any) => t.status !== "WON'T DO" && t.status !== "WONT DO").length;
  const percentage = activeTasks === 0 ? (totalTasks > 0 ? 100 : 0) : Math.round((doneTasks / activeTasks) * 100);

  return (
    <div ref={setNodeRef} style={style} className={cn("flex flex-col bg-card", isDragging && "z-40 relative")}>
      {/* Epic Header Row */}
      <div 
        className="flex border-b bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer select-none"
        onClick={onToggleExpand}
      >
        {/* Title area spanning Task + PIC + Status + MD */}
        <div 
          style={{ width: `${offsets.epicTitle}px` }} 
          className="md:sticky md:left-0 md:z-20 bg-muted border-r shrink-0 flex items-center px-2 py-2 overflow-hidden"
        >
          {!isContinuation && hasEdit ? (
            <div 
              {...attributes} 
              {...listeners} 
              className="cursor-grab text-muted-foreground hover:text-foreground mr-1.5 p-1 shrink-0" 
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-4 mr-1.5 shrink-0" />
          )}

          <button 
            className="mr-1 text-muted-foreground hover:text-foreground focus:outline-none p-1 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          <TaskText text={epic.name} className="font-bold text-sm uppercase tracking-wider text-foreground" />

          {isContinuation && (
            <span className="text-[11px] font-semibold text-muted-foreground ml-1.5 italic shrink-0">
              (cont.)
            </span>
          )}

          <span className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 shrink-0",
            percentage === 100 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
            percentage > 0 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
            "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
          )}>
            {percentage}%
          </span>
        </div>

        {/* Action button aligned with Actions column */}
        <div 
          style={{ width: `${colWidths.actions}px`, left: `${offsets.epicTitle}px` }} 
          className="md:sticky md:z-20 bg-muted border-r shrink-0 flex items-center justify-center px-2 py-2 overflow-hidden"
        >
          {hasEdit ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="p-1 text-muted-foreground hover:text-foreground rounded" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddTaskToEpic(epic); }}>Add Task</DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEditEpic(epic); }}>Edit Epic</DropdownMenuItem>
                {hasDelete && (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => { e.stopPropagation(); onDeleteEpic(epic); }}>
                    Delete Epic
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
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
      
      {/* Task List inside this Epic segment */}
      {isExpanded && (
        <SortableContext items={tasks.map((t: any) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col min-h-[10px]">
            {tasks.map((task: any) => (
              <TaskRow 
                key={task.id} 
                task={task} 
                dates={dates} 
                holidays={holidays}
                pics={pics}
                overlapInfo={overlapMap?.get(task.id)}
                onEdit={onEditTask} 
                onDelete={onDeleteTask}
                onUpdateStatus={onUpdateTaskStatus}
                onAssignToMe={onAssignToMe}
                onSetInReview={onSetInReview}
                onBackToTodo={onBackToTodo}
                hasEdit={hasEdit}
                hasDelete={hasDelete}
                taskStatuses={taskStatuses}
                getStatusColor={getStatusColor}
                colWidths={colWidths}
                offsets={offsets}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
});

// -------------------------------------------------------------
// MAIN PAGE
// -------------------------------------------------------------

export default function TimelinePage() {
  const confirm = useConfirm();
  const alertModal = useAlertModal();
  const { projects, activeProject, isItemInActiveProject, isLoading: isProjectsLoading } = useProject();
  const { isSuperAdmin } = useAuth();

  const { data: rawEpics, isLoading: isLoadingEpics } = useCollection<any>("timelineEpics", {
    projectId: activeProject?.id,
    enabled: Boolean(activeProject?.id),
  });
  const { data: rawTasks, isLoading: isLoadingTasks } = useCollection<any>("timelineTasks", {
    projectId: activeProject?.id,
    enabled: Boolean(activeProject?.id),
  });
  const { data: holidays } = useCollection<any>("timelineHolidays");
  const { data: pics } = useCollection<any>("timelinePics", {
    projectId: activeProject?.id,
    enabled: Boolean(activeProject?.id),
  });
  const { statuses: taskStatuses, getStatusColor } = useTaskStatuses();
  const { canView, canEdit, canDelete, currentUser } = usePermissions();

  const hasView = canView("timeline");
  const hasEdit = canEdit("timeline");
  const hasDelete = canDelete("timeline");

  const projectPics = useMemo(() => {
    return (pics || []).filter((p: any) => isItemInActiveProject(p.projectId));
  }, [pics, isItemInActiveProject]);

  const { mutateAsync: addPic } = useAddDocument("timelinePics");
  const { mutateAsync: updateEpic } = useUpdateDocument("timelineEpics");
  const { mutateAsync: updateTask } = useUpdateDocument("timelineTasks");
  const { mutateAsync: deleteEpic } = useDeleteDocument("timelineEpics");
  const { mutateAsync: deleteTask } = useDeleteDocument("timelineTasks");
  const { mutateAsync: addAssignmentLog } = useAddDocument("assignmentLogs");

  const [isEpicDialogOpen, setIsEpicDialogOpen] = useState(false);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isHolidaysDialogOpen, setIsHolidaysDialogOpen] = useState(false);
  const [isPicsDialogOpen, setIsPicsDialogOpen] = useState(false);
  const [isChartsDialogOpen, setIsChartsDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [editingEpic, setEditingEpic] = useState<any>(null);
  const [editingTask, setEditingTask] = useState<any>(null);

  // Column Resizing State
  const [colWidths, setColWidths] = useState<ColWidths>(DEFAULT_COL_WIDTHS);

  // Load saved column widths from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("timeline_col_widths");
      if (saved) {
        const parsed = JSON.parse(saved);
        setColWidths({
          task: typeof parsed.task === "number" ? Math.min(600, Math.max(150, parsed.task)) : DEFAULT_COL_WIDTHS.task,
          pic: typeof parsed.pic === "number" ? Math.min(220, Math.max(80, parsed.pic)) : DEFAULT_COL_WIDTHS.pic,
          status: typeof parsed.status === "number" ? Math.min(200, Math.max(80, parsed.status)) : DEFAULT_COL_WIDTHS.status,
          priority: DEFAULT_COL_WIDTHS.priority,
          md: DEFAULT_COL_WIDTHS.md,
          actions: DEFAULT_COL_WIDTHS.actions,
        });
      }
    } catch (e) {
      console.error("Failed to load timeline_col_widths:", e);
    }
  }, []);

  const offsets = useMemo(() => computeOffsets(colWidths), [colWidths]);

  // Handle column resize drag
  const handleMouseDownResize = useCallback((e: React.MouseEvent, colKey: "task" | "pic" | "status") => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[colKey];
    const limits = COL_LIMITS[colKey];

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.min(limits.max, Math.max(limits.min, startWidth + delta));
      setColWidths(prev => ({ ...prev, [colKey]: newWidth }));
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      // Persist to localStorage
      setColWidths(latest => {
        try {
          localStorage.setItem("timeline_col_widths", JSON.stringify(latest));
        } catch (err) {
          console.error("Failed to save timeline_col_widths:", err);
        }
        return latest;
      });
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [colWidths]);

  // Double click to reset column width to default
  const handleDoubleClickReset = useCallback((colKey: "task" | "pic" | "status") => {
    setColWidths(prev => {
      const updated = { ...prev, [colKey]: DEFAULT_COL_WIDTHS[colKey] };
      try {
        localStorage.setItem("timeline_col_widths", JSON.stringify(updated));
      } catch (err) {
        console.error("Failed to reset timeline_col_widths:", err);
      }
      return updated;
    });
  }, []);

  const handleDeleteEpic = async (epic: any) => {
    const ok = await confirm({
      title: "Delete Epic?",
      description: `Are you sure you want to delete Epic "${epic.name}" and all its tasks? This action cannot be undone.`,
      confirmText: "Delete Epic",
      cancelText: "Cancel",
      variant: "destructive",
    });
    if (ok) {
      await deleteEpic(epic.id);
    }
  };

  const handleDeleteTask = async (task: any) => {
    const ok = await confirm({
      title: "Hapus Task?",
      description: `Apakah Anda yakin ingin menghapus task "${task.name}"? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Hapus Task",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (ok) {
      await deleteTask(task.id);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      const targetTask = localTasks.find((t) => t.id === taskId) || (rawTasks || []).find((t: any) => t.id === taskId);
      const oldStatus = targetTask?.status || "TODO";
      const statusChanged = oldStatus !== newStatus;

      await updateTask({ id: taskId, data: { status: newStatus } });

      const nextTasks = localTasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t));
      setLocalTasks(nextTasks);
      const projectId = activeProject?.id || "_global_";
      saveProjectCacheToRedis(projectId, {
        tasks: nextTasks,
        epics: orderedEpics,
      }).catch(console.warn);

      if (statusChanged && targetTask) {
        const currentUserName = currentUser?.name || currentUser?.username || "User";
        const targetEpic = orderedEpics.find((e) => e.id === targetTask.epicId);

        const logPayload = {
          category: "task" as const,
          action: "STATUS_CHANGE",
          taskId: taskId,
          taskName: targetTask.name || "Untitled Task",
          epicId: targetTask.epicId || null,
          epicName: targetEpic?.name || "-",
          projectId: projectId,
          projectName: activeProject?.name || "Global / Shared",
          userId: currentUser?.id || "unknown",
          username: currentUser?.username || "-",
          userName: currentUserName,
          previousStatus: oldStatus,
          status: newStatus,
          previousPic: targetTask.pic || "-",
          md: targetTask.md,
          startDate: targetTask.startDate,
          endDate: targetTask.endDate,
          details: `Mengubah status task dari "${oldStatus}" menjadi "${newStatus}"`,
          changes: [
            {
              field: "status",
              label: "Status Task",
              oldValue: oldStatus,
              newValue: newStatus,
            },
          ],
          claimedAt: serverTimestamp(),
          timestamp: new Date().toISOString(),
        };

        try {
          const newLogDoc = await addAssignmentLog(logPayload);
          appendAssignmentLogToRedis({
            ...logPayload,
            id: (newLogDoc as any)?.id || `log-${Date.now()}`,
          }).catch(console.warn);
        } catch (logErr) {
          console.warn("Failed to record status change log:", logErr);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [assignToMeTask, setAssignToMeTask] = useState<any | null>(null);

  const handleAssignToMe = (task: any) => {
    setAssignToMeTask(task);
  };

  const handleAssignSuccess = (updatedTask: any) => {
    setLocalTasks((prev) => {
      const nextTasks = prev.map((t) => (t.id === updatedTask.id ? { ...t, ...updatedTask } : t));
      const projectId = activeProject?.id || "_global_";
      saveProjectCacheToRedis(projectId, {
        tasks: nextTasks,
        epics: orderedEpics,
      }).catch(console.warn);
      return nextTasks;
    });
    setAssignToMeTask(null);
  };

  const handleSetInReview = async (task: any) => {
    try {
      const taskId = task.id || task._id || task.taskId;
      if (!taskId) return;
      const oldStatus = task.status || "ON PROGRESS";

      await updateTask({
        id: taskId,
        data: {
          status: "IN REVIEW",
        },
      });
      const nextTasks = localTasks.map((t) => (t.id === taskId ? { ...t, status: "IN REVIEW" } : t));
      setLocalTasks(nextTasks);
      const projectId = activeProject?.id || "_global_";
      saveProjectCacheToRedis(projectId, {
        tasks: nextTasks,
        epics: orderedEpics,
      }).catch(console.warn);

      if (oldStatus !== "IN REVIEW") {
        const currentUserName = currentUser?.name || currentUser?.username || "User";
        const targetEpic = orderedEpics.find((e) => e.id === task.epicId);

        const logPayload = {
          category: "task" as const,
          action: "STATUS_CHANGE",
          taskId: taskId,
          taskName: task.name || "Untitled Task",
          epicId: task.epicId || null,
          epicName: targetEpic?.name || "-",
          projectId: projectId,
          projectName: activeProject?.name || "Global / Shared",
          userId: currentUser?.id || "unknown",
          username: currentUser?.username || "-",
          userName: currentUserName,
          previousStatus: oldStatus,
          status: "IN REVIEW",
          previousPic: task.pic || "-",
          md: task.md,
          startDate: task.startDate,
          endDate: task.endDate,
          details: `Mengubah status task dari "${oldStatus}" menjadi "IN REVIEW"`,
          changes: [
            {
              field: "status",
              label: "Status Task",
              oldValue: oldStatus,
              newValue: "IN REVIEW",
            },
          ],
          claimedAt: serverTimestamp(),
          timestamp: new Date().toISOString(),
        };

        try {
          const newLogDoc = await addAssignmentLog(logPayload);
          appendAssignmentLogToRedis({
            ...logPayload,
            id: (newLogDoc as any)?.id || `log-${Date.now()}`,
          }).catch(console.warn);
        } catch (logErr) {
          console.warn("Failed to record set in review log:", logErr);
        }
      }
    } catch (e) {
      console.error("Failed to set task status to IN REVIEW:", e);
    }
  };

  const [orderedEpics, setOrderedEpics] = useState<any[]>([]);
  const [localTasks, setLocalTasks] = useState<any[]>([]);
  const [selectedPicFilter, setSelectedPicFilter] = useState<string>("ALL");

  const handleBackToTodo = async (task: any) => {
    const taskId = task.id || task._id || task.taskId;
    if (!taskId) return;

    const ok = await confirm({
      title: "Kembalikan ke TODO?",
      description: `Apakah Anda yakin ingin mengembalikan task "${task.name}" ke status TODO? PIC dan Start Date akan direset menjadi TBD.`,
      confirmText: "Ya, Kembalikan ke TODO",
      cancelText: "Batal",
      variant: "default",
    });
    if (!ok) return;

    try {
      const updatedData = {
        status: "TODO",
        pic: "TBD",
        startDate: "TBD",
        endDate: "",
        updatedAt: serverTimestamp(),
      };

      await updateTask({
        id: taskId,
        data: updatedData,
      });

      // Audit log in assignmentLogs & Redis
      try {
        const epic = orderedEpics.find((e) => e.id === task.epicId);
        const logPayload = {
          category: "task" as const,
          taskId: taskId,
          taskName: task.name || "Untitled Task",
          epicId: task.epicId || null,
          epicName: epic?.name || "-",
          projectId: task.projectId || activeProject?.id || "_global_",
          projectName: activeProject?.name || "Global / Shared",
          userId: currentUser?.id || "unknown",
          username: currentUser?.username || "-",
          userName: currentUser?.name || currentUser?.username || "User",
          action: "BACK_TODO",
          previousStatus: task.status || "ON PROGRESS",
          previousPic: task.pic || "-",
          previousStartDate: task.startDate || "-",
          status: "TODO",
          pic: "TBD",
          startDate: "TBD",
          details: `Mengembalikan task "${task.name || 'Untitled'}" ke TODO`,
          changes: [
            { field: "status", label: "Status Task", oldValue: task.status || "ON PROGRESS", newValue: "TODO" },
            { field: "pic", label: "PIC", oldValue: task.pic || "-", newValue: "TBD" },
          ],
          claimedAt: serverTimestamp(),
          timestamp: new Date().toISOString(),
        };

        const newLogDoc = await addAssignmentLog(logPayload);
        appendAssignmentLogToRedis({
          ...logPayload,
          id: (newLogDoc as any)?.id || `log-${Date.now()}`,
        }).catch(console.warn);
      } catch (logErr) {
        console.warn("Failed to create assignment log:", logErr);
      }

      // Optimistic update local tasks & Redis cache
      setLocalTasks((prev) => {
        const nextTasks = prev.map((t) => (t.id === taskId ? { ...t, ...updatedData } : t));
        const projectId = activeProject?.id || "_global_";
        saveProjectCacheToRedis(projectId, {
          tasks: nextTasks,
          epics: orderedEpics,
        }).catch(console.warn);
        return nextTasks;
      });
    } catch (e) {
      console.error("Failed to reset task to TODO:", e);
    }
  };

  // Search State
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(40);

  // Collapse/Expand state per epic
  const [collapsedEpicIds, setCollapsedEpicIds] = useState<Set<string>>(new Set());

  const toggleEpicExpanded = (epicId: string) => {
    setCollapsedEpicIds(prev => {
      const next = new Set(prev);
      if (next.has(epicId)) {
        next.delete(epicId);
      } else {
        next.add(epicId);
      }
      return next;
    });
  };

  const handleCollapseAll = () => {
    const allIds = new Set(orderedEpics.map(e => e.id));
    setCollapsedEpicIds(allIds);
  };

  const handleExpandAll = () => {
    setCollapsedEpicIds(new Set());
  };

  // Viewer-first Redis caching logic & Editor auto-sync
  const [cacheSource, setCacheSource] = useState<"redis" | "firebase" | "loading">("loading");
  const hasInitialLoadedRef = useRef(false);

  // Fetch cache for viewers on mount / activeProject change
  useEffect(() => {
    if (hasEdit) {
      setCacheSource("firebase");
      return;
    }

    let isMounted = true;
    setCacheSource("loading");

    async function loadViewerData() {
      if (!activeProject?.id) {
        return;
      }
      const projectId = activeProject.id;
      const cached = await fetchCachedTimelineData(projectId);
      if (!isMounted) return;

      const hasTasks = Array.isArray(cached.tasks) && cached.tasks.length > 0;
      const hasEpics = Array.isArray(cached.epics) && cached.epics.length > 0;

      if (cached.source === "redis" && (hasTasks || hasEpics)) {
        const scopedEpics = (cached.epics || []).filter((e: any) => isItemInActiveProject(e.projectId));
        const scopedTasks = (cached.tasks || []).filter((t: any) => isItemInActiveProject(t.projectId));
        const epics = scopedEpics.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        const tasks = scopedTasks.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        setOrderedEpics(epics);
        setLocalTasks(tasks);
        setCacheSource("redis");
      } else {
        // Fallback to Firebase
        setCacheSource("firebase");
        if (rawEpics) {
          const filtered = rawEpics.filter((e: any) => isItemInActiveProject(e.projectId));
          setOrderedEpics(filtered.sort((a, b) => (a.order || 0) - (b.order || 0)));
        }
        if (rawTasks) {
          const filtered = rawTasks.filter((t: any) => isItemInActiveProject(t.projectId));
          setLocalTasks(filtered.sort((a, b) => (a.order || 0) - (b.order || 0)));
        }
      }
    }

    loadViewerData();

    return () => {
      isMounted = false;
    };
  }, [hasEdit, activeProject?.id]);

  // Sync from Firestore: for editors OR when cacheSource is not redis
  useEffect(() => {
    if (!hasEdit && cacheSource === "redis") return;
    if (rawEpics) {
      const filtered = rawEpics.filter((e: any) => isItemInActiveProject(e.projectId));
      setOrderedEpics(filtered.sort((a, b) => (a.order || 0) - (b.order || 0)));
    }
  }, [rawEpics, isItemInActiveProject, hasEdit, cacheSource]);

  useEffect(() => {
    if (!hasEdit && cacheSource === "redis") return;
    if (rawTasks) {
      const filtered = rawTasks.filter((t: any) => isItemInActiveProject(t.projectId));
      setLocalTasks(filtered.sort((a, b) => (a.order || 0) - (b.order || 0)));
    }
  }, [rawTasks, isItemInActiveProject, hasEdit, cacheSource]);

  // Track initial load completion for editors
  useEffect(() => {
    if (hasEdit && !isLoadingEpics && !isLoadingTasks && (rawEpics || rawTasks)) {
      hasInitialLoadedRef.current = true;
    }
  }, [hasEdit, isLoadingEpics, isLoadingTasks, rawEpics, rawTasks]);

  // Auto-sync edits to Redis in online mode whenever tasks or epics change after initial load
  useEffect(() => {
    if (!hasEdit) return;
    if (!hasInitialLoadedRef.current) return;
    if (isLoadingEpics || isLoadingTasks) return;

    const timer = setTimeout(() => {
      const projectId = activeProject?.id || "_global_";
      saveProjectCacheToRedis(projectId, {
        tasks: localTasks,
        epics: orderedEpics,
        pics: projectPics,
        statuses: taskStatuses,
      });
    }, 1200);

    return () => clearTimeout(timer);
  }, [localTasks, orderedEpics, projectPics, taskStatuses, hasEdit, isLoadingEpics, isLoadingTasks, activeProject?.id]);

  const [activeId, setActiveId] = useState<string | null>(null);

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

  // Filtered epics based on PIC filter
  const filteredOrderedEpics = useMemo(() => {
    if (selectedPicFilter === "ALL") return orderedEpics;
    return orderedEpics.filter(epic => 
      localTasks.some(t => t.epicId === epic.id && t.pic === selectedPicFilter)
    );
  }, [orderedEpics, localTasks, selectedPicFilter]);

  // Flatten rows for pagination and search
  const scrollToToday = () => {
    if (!scrollContainerRef.current) return;
    const todayStr = new Date().toDateString();
    const todayIndex = dates.findIndex((d) => d.toDateString() === todayStr);
    if (todayIndex >= 0) {
      const targetScroll = Math.max(0, todayIndex * 40 - 120);
      scrollContainerRef.current.scrollTo({
        left: targetScroll,
        behavior: "smooth",
      });
    }
  };

  const isSearchActive = searchQuery.trim().length >= 3;
  const searchLower = searchQuery.toLowerCase().trim();

  // Calculate search matching task count for badge
  const totalSearchResultTasks = useMemo(() => {
    if (!isSearchActive) return 0;
    let count = 0;
    filteredOrderedEpics.forEach(epic => {
      let epicTasks = localTasks.filter(t => t.epicId === epic.id);
      if (selectedPicFilter !== "ALL") {
        epicTasks = epicTasks.filter(t => t.pic === selectedPicFilter);
      }
      const epicMatches = (epic.name || "").toLowerCase().includes(searchLower);
      if (epicMatches) {
        count += epicTasks.length;
      } else {
        count += epicTasks.filter(t =>
          (t.name || "").toLowerCase().includes(searchLower) ||
          (t.pic || "").toLowerCase().includes(searchLower)
        ).length;
      }
    });
    return count;
  }, [filteredOrderedEpics, localTasks, selectedPicFilter, isSearchActive, searchLower]);

  // Build full flattened rows (Epic Header + Tasks)
  interface FlatRowItem {
    type: "epic" | "task";
    epic: any;
    task?: any;
    allEpicTasks: any[];
  }

  const allFlattenedRows = useMemo(() => {
    const rows: FlatRowItem[] = [];

    filteredOrderedEpics.forEach(epic => {
      let epicTasks = localTasks.filter(t => t.epicId === epic.id);
      if (selectedPicFilter !== "ALL") {
        epicTasks = epicTasks.filter(t => t.pic === selectedPicFilter);
      }

      if (isSearchActive) {
        const epicMatches = (epic.name || "").toLowerCase().includes(searchLower);
        if (!epicMatches) {
          epicTasks = epicTasks.filter(t => 
            (t.name || "").toLowerCase().includes(searchLower) ||
            (t.pic || "").toLowerCase().includes(searchLower)
          );
        }
        if (!epicMatches && epicTasks.length === 0) {
          return; // Skip epic entirely if nothing matched
        }
      }

      // 1. Epic Header row
      rows.push({
        type: "epic",
        epic,
        allEpicTasks: epicTasks,
      });

      // 2. Task rows (if expanded)
      const isExpanded = !collapsedEpicIds.has(epic.id);
      if (isExpanded) {
        epicTasks.forEach(task => {
          rows.push({
            type: "task",
            epic,
            task,
            allEpicTasks: epicTasks,
          });
        });
      }
    });

    return rows;
  }, [filteredOrderedEpics, localTasks, selectedPicFilter, isSearchActive, searchLower, collapsedEpicIds]);

  const totalRows = allFlattenedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  // Clamped page number
  const safeCurrentPage = isSearchActive ? 0 : Math.min(currentPage, Math.max(0, totalPages - 1));

  // Slice rows for current page (or all if search is active)
  const pagedRows = useMemo(() => {
    if (isSearchActive) {
      return allFlattenedRows;
    }
    const start = safeCurrentPage * pageSize;
    const end = Math.min(start + pageSize, totalRows);
    return allFlattenedRows.slice(start, end);
  }, [allFlattenedRows, isSearchActive, safeCurrentPage, pageSize, totalRows]);

  // Group sliced rows into Epic segments (injecting (cont.) headers if an epic is split)
  const currentEpicSegments = useMemo(() => {
    const segments: EpicSegment[] = [];
    if (pagedRows.length === 0) return segments;

    let currentSegment: EpicSegment | null = null;

    // Check if the page starts directly with a task (split epic)
    if (!isSearchActive && pagedRows[0].type === "task") {
      const first = pagedRows[0];
      currentSegment = {
        key: `${first.epic.id}-cont-${safeCurrentPage}`,
        epic: first.epic,
        isContinuation: true,
        tasks: [],
        allEpicTasks: first.allEpicTasks,
      };
      segments.push(currentSegment);
    }

    for (const row of pagedRows) {
      if (row.type === "epic") {
        currentSegment = {
          key: `${row.epic.id}-${safeCurrentPage}`,
          epic: row.epic,
          isContinuation: false,
          tasks: [],
          allEpicTasks: row.allEpicTasks,
        };
        segments.push(currentSegment);
      } else if (row.type === "task") {
        if (!currentSegment || currentSegment.epic.id !== row.epic.id) {
          currentSegment = {
            key: `${row.epic.id}-cont-${safeCurrentPage}`,
            epic: row.epic,
            isContinuation: true,
            tasks: [],
            allEpicTasks: row.allEpicTasks,
          };
          segments.push(currentSegment);
        }
        currentSegment.tasks.push(row.task);
      }
    }

    return segments;
  }, [pagedRows, isSearchActive, safeCurrentPage]);

  // Row counters for display
  const startRow = totalRows === 0 ? 0 : safeCurrentPage * pageSize + 1;
  const endRow = totalRows === 0 ? 0 : Math.min((safeCurrentPage + 1) * pageSize, totalRows);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Moving Task between Epics
    if (activeData?.type === "Task" && overData?.type === "Task") {
      const activeTask = activeData.task;
      const overTask = overData.task;

      if (activeTask.epicId !== overTask.epicId) {
        setLocalTasks(prev => {
          const activeIndex = prev.findIndex(t => t.id === active.id);
          const overIndex = prev.findIndex(t => t.id === over.id);
          
          const newTasks = [...prev];
          newTasks[activeIndex] = { ...newTasks[activeIndex], epicId: overTask.epicId };
          return arrayMove(newTasks, activeIndex, overIndex);
        });
      }
    }
    // Moving Task onto an empty Epic (or directly on Epic header)
    else if (activeData?.type === "Task" && overData?.type === "Epic") {
      const activeTask = activeData.task;
      const overEpic = overData.epic;

      if (activeTask.epicId !== overEpic.id) {
        setLocalTasks(prev => {
          const activeIndex = prev.findIndex(t => t.id === active.id);
          const newTasks = [...prev];
          newTasks[activeIndex] = { ...newTasks[activeIndex], epicId: overEpic.id };
          return newTasks;
        });
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Reordering Epics
    if (activeData?.type === "Epic" && overData?.type === "Epic" && active.id !== over.id) {
      setOrderedEpics(prev => {
        const oldIndex = prev.findIndex(e => e.id === active.id);
        const newIndex = prev.findIndex(e => e.id === over.id);
        const newItems = arrayMove(prev, oldIndex, newIndex);
        
        newItems.forEach((item, index) => {
          if (item.order !== index) {
            updateEpic({ id: item.id, data: { order: index } });
          }
        });
        return newItems;
      });
    }
    
    // Reordering Tasks
    if (activeData?.type === "Task") {
      const taskInState = localTasks.find(t => t.id === active.id);
      if (!taskInState) return;

      const currentEpicId = taskInState.epicId;
      
      if (overData?.type === "Task" && active.id !== over.id) {
        setLocalTasks(prev => {
          const oldIndex = prev.findIndex(t => t.id === active.id);
          const newIndex = prev.findIndex(t => t.id === over.id);
          const newItems = arrayMove(prev, oldIndex, newIndex);
          
          const epicTasks = newItems.filter(t => t.epicId === currentEpicId);
          epicTasks.forEach((item, index) => {
             updateTask({ id: item.id, data: { order: index, epicId: currentEpicId } });
          });
          
          return newItems;
        });
      } else {
        const epicTasks = localTasks.filter(t => t.epicId === currentEpicId);
        epicTasks.forEach((item, index) => {
            updateTask({ id: item.id, data: { order: index, epicId: currentEpicId } });
        });
      }
    }
  };

  // Check if non-admin user has no assigned projects
  if (!isSuperAdmin && !isProjectsLoading && projects.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Panel className="max-w-md text-center p-8 border-dashed border-border bg-card shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
            <Layers className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-1">No Assigned Projects</h2>
          <p className="text-xs text-muted-foreground">
            You are currently not assigned to any project workspaces. Please contact your administrator to grant you access to one or more projects.
          </p>
        </Panel>
      </div>
    );
  }

  if (!hasView) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Panel className="max-w-md text-center p-8 border-destructive/30 bg-destructive/5">
          <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-1">Access Restricted</h2>
          <p className="text-xs text-muted-foreground">
            You do not have permission to view Timeline in this project.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <Panel className="h-[calc(100dvh-104px)] min-h-0 border-t-4 border-t-primary flex flex-col">
      <PanelHeader className="flex flex-col xl:flex-row items-start justify-between border-b-0 pb-3 gap-4 shrink-0">
        <div className="w-full xl:w-auto">
          <PanelTitle className="text-2xl font-bold text-secondary-foreground flex items-center gap-2 flex-wrap">
            <CalendarClock className="w-6 h-6 text-primary" /> Timeline
            {!hasEdit && (
              <>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 ml-2">
                  <Eye className="w-3 h-3" />
                  Watch Only
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ml-1.5 transition-colors",
                    cacheSource === "redis"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                  )}
                  title={cacheSource === "redis" ? "Data dimuat dari Redis Fast Cache" : "Data dimuat dari Firebase Cloud"}
                >
                  {cacheSource === "redis" ? (
                    <>
                      <Zap className="w-3 h-3 text-emerald-500" />
                      Redis Cache
                    </>
                  ) : (
                    <>
                      <Database className="w-3 h-3 text-blue-500" />
                      Firebase
                    </>
                  )}
                </span>
              </>
            )}
          </PanelTitle>
          <PanelDescription className="mt-1">
            Gantt schedule and roadmap for {activeProject?.name || "this project"}.
          </PanelDescription>
        </div>

        <div className="flex flex-col gap-2.5 w-full xl:w-auto items-start xl:items-end">
          {/* Row 1: Action Buttons (Clean & Grouped) */}
          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-start xl:justify-end">
            {/* View Settings Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "px-3 h-8 text-xs font-medium gap-1.5")}>
                <Eye className="w-3.5 h-3.5" />
                <span>View</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Display Preferences</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={showNonWorkingDays}
                  onCheckedChange={setShowNonWorkingDays}
                >
                  Show Holidays & Weekends
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsHolidaysDialogOpen(true)}>
                  <Calendar className="w-3.5 h-3.5 mr-2 text-primary" />
                  Manage Holidays
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Analytics */}
            <Button
              onClick={() => setIsChartsDialogOpen(true)}
              variant="outline"
              className="px-3 h-8 text-xs font-medium gap-1.5"
            >
              <PieChart className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Analytics</span>
            </Button>

            {/* Share & Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "px-3 h-8 text-xs font-medium gap-1.5 border-primary/30 text-primary hover:bg-primary/10")}>
                <Share2 className="w-3.5 h-3.5" />
                <span>Share & Export</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>Sharing</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    const hasTimeline = orderedEpics.length > 0 || localTasks.length > 0;
                    if (!hasTimeline) {
                      alertModal({
                        title: "Timeline Not Available",
                        description: `Project "${activeProject?.name || "this project"}" does not have any timeline data yet (Epics or Tasks). Please create at least one Epic or Task before sharing the link.`,
                        variant: "warning",
                      });
                      return;
                    }
                    setIsShareDialogOpen(true);
                  }}
                >
                  <Share2 className="w-3.5 h-3.5 mr-2 text-primary" />
                  <span>Share Link</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Export Roadmap</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    const hasTimeline = orderedEpics.length > 0 || localTasks.length > 0;
                    if (!hasTimeline) {
                      alertModal({
                        title: "Timeline Not Available",
                        description: `Project "${activeProject?.name || "this project"}" does not have any timeline data to export.`,
                        variant: "warning",
                      });
                      return;
                    }
                    setIsExportDialogOpen(true);
                  }}
                >
                  <Download className="w-3.5 h-3.5 mr-2 text-primary" />
                  <span>Export Image (PNG) / PDF...</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportTimelineToExcel(orderedEpics, localTasks, dates, holidays, projectPics, (msg) => alertModal({ title: "Export Excel", description: msg, variant: "info" }))}>
                  <FileSpreadsheet className="w-3.5 h-3.5 mr-2 text-green-600 dark:text-green-500" />
                  <span>Export to Excel (.xlsx)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Primary Actions */}
            {hasEdit && (
              <Button
                onClick={() => { setEditingEpic(null); setIsEpicDialogOpen(true); }}
                variant="outline"
                className="px-3 h-8 text-xs font-medium gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Epic</span>
              </Button>
            )}
            {hasEdit && (
              <Button
                onClick={() => { setEditingTask(null); setIsTaskDialogOpen(true); }}
                className="px-3 h-8 text-xs font-medium gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Task</span>
              </Button>
            )}

            {/* Modal Dialogs */}
            <EpicDialog 
              open={isEpicDialogOpen} 
              onOpenChange={setIsEpicDialogOpen} 
              epicToEdit={editingEpic}
              readOnly={!hasEdit}
              onSelectTask={(task) => {
                setEditingTask(task);
                setIsTaskDialogOpen(true);
              }}
            />
            <TaskDialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen} taskToEdit={editingTask} fromTimeline={true} readOnly={!hasEdit} />
            <AssignToMeDialog open={!!assignToMeTask} onOpenChange={(open) => !open && setAssignToMeTask(null)} task={assignToMeTask} onSuccess={handleAssignSuccess} />
            <HolidaysDialog open={isHolidaysDialogOpen} onOpenChange={setIsHolidaysDialogOpen} />
            <PicsDialog open={isPicsDialogOpen} onOpenChange={setIsPicsDialogOpen} />
            <ChartsDialog open={isChartsDialogOpen} onOpenChange={setIsChartsDialogOpen} tasks={localTasks} pics={projectPics} statuses={taskStatuses} />
            <TimelineExportDialog
              open={isExportDialogOpen}
              onOpenChange={setIsExportDialogOpen}
              timelineRef={timelineContainerRef}
              activeProject={activeProject}
              totalTasks={localTasks.length}
              totalEpics={orderedEpics.length}
            />
            <ProjectShareDialog
              open={isShareDialogOpen}
              onOpenChange={setIsShareDialogOpen}
              hasTimeline={orderedEpics.length > 0 || localTasks.length > 0}
            />
          </div>

          {/* Row 2: Filter & Search Toolbar */}
          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-start xl:justify-end bg-muted/40 p-1.5 rounded-lg border border-border/60">
            {/* Search Bar */}
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-2.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(0);
                }}
                placeholder="Search task, epic, PIC (min. 3 chars)..."
                className="h-8 pl-8 pr-7 text-xs bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-primary w-40 sm:w-56 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentPage(0);
                  }}
                  className="absolute right-2 text-muted-foreground hover:text-foreground p-0.5 rounded-sm"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Search Results Badge */}
            {isSearchActive && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                {totalSearchResultTasks} {totalSearchResultTasks === 1 ? "result" : "results"}
              </span>
            )}

            <div className="h-4 w-px bg-border/60 mx-0.5 hidden sm:block" />

            <span className="text-xs font-semibold text-muted-foreground px-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-primary" /> Filter:
            </span>

            {/* Date Range Filter */}
            <DateRangeFilter rangeConfig={rangeConfig} onChange={setRangeConfig} tasks={localTasks} />

            {/* Jump to Today Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={scrollToToday}
              className="h-8 px-2.5 text-xs font-medium gap-1 text-primary border-primary/30 hover:bg-primary/10 shadow-2xs shrink-0"
              title="Lompat ke tanggal hari ini di timeline"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Hari Ini</span>
            </Button>

            {/* PIC Filter Dropdown */}
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
                  {[...projectPics].sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")).map((pic: any) => (
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
            <p>No Epics found. Create an Epic to get started!</p>
          </div>
        ) : (
          <div ref={scrollContainerRef} className="flex-1 overflow-auto bg-card relative custom-scrollbar">
            <div className="min-w-max flex flex-col" ref={timelineContainerRef}>
              
              <div className="flex flex-col sticky top-0 z-30 shadow-sm bg-background">
                {/* Month Row */}
                <div className="flex bg-muted border-b">
                  <div 
                    style={{ width: `${offsets.totalHeader}px` }} 
                    className="md:sticky md:left-0 md:z-40 bg-muted border-r shrink-0" 
                  />
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

                {/* Days Row / Column Headers */}
                <div className="flex bg-muted border-b select-none">
                  {/* 1. Epic / Task Header */}
                  <div
                    style={{ width: `${colWidths.task}px` }}
                    className="relative md:sticky md:left-0 md:z-40 bg-muted border-r shrink-0 px-4 py-2 font-semibold text-sm uppercase tracking-wider flex items-center select-none"
                  >
                    <span className="truncate">Epic / Task</span>
                    <ColumnResizeHandle
                      onMouseDown={(e) => handleMouseDownResize(e, "task")}
                      onDoubleClick={() => handleDoubleClickReset("task")}
                    />
                  </div>

                  {/* 2. PIC Header */}
                  <div
                    style={{ width: `${colWidths.pic}px`, left: `${offsets.pic}px` }}
                    className="relative md:sticky md:z-40 bg-muted border-r shrink-0 px-4 py-2 font-semibold text-sm uppercase tracking-wider flex items-center select-none"
                  >
                    <span className="truncate">PIC</span>
                    <ColumnResizeHandle
                      onMouseDown={(e) => handleMouseDownResize(e, "pic")}
                      onDoubleClick={() => handleDoubleClickReset("pic")}
                    />
                  </div>

                  {/* 3. Status Header */}
                  <div
                    style={{ width: `${colWidths.status}px`, left: `${offsets.status}px` }}
                    className="relative md:sticky md:z-40 bg-muted border-r shrink-0 px-4 py-2 font-semibold text-sm uppercase tracking-wider flex items-center justify-center select-none"
                  >
                    <span className="truncate">Status</span>
                    <ColumnResizeHandle
                      onMouseDown={(e) => handleMouseDownResize(e, "status")}
                      onDoubleClick={() => handleDoubleClickReset("status")}
                    />
                  </div>

                  {/* 3b. Priority Header (Fixed) */}
                  <div
                    style={{ width: `${colWidths.priority ?? DEFAULT_COL_WIDTHS.priority}px`, left: `${offsets.priority}px` }}
                    className="md:sticky md:z-40 bg-muted border-r shrink-0 px-1 py-2 font-semibold text-xs uppercase tracking-wider flex items-center justify-center select-none"
                    title="Priority (P1, P2, ...)"
                  >
                    (P)
                  </div>

                  {/* 4. MD Header (Fixed) */}
                  <div
                    style={{ width: `${colWidths.md}px`, left: `${offsets.md}px` }}
                    className="md:sticky md:z-40 bg-muted border-r shrink-0 px-2 py-2 font-semibold text-sm uppercase tracking-wider flex items-center justify-center select-none"
                  >
                    MD
                  </div>

                  {/* 5. Actions Header (Fixed) */}
                  <div
                    style={{ width: `${colWidths.actions}px`, left: `${offsets.actions}px` }}
                    className="md:sticky md:z-40 bg-muted border-r shrink-0 px-1 py-1 flex items-center justify-center gap-0.5 select-none"
                  >
                    <button onClick={handleCollapseAll} title="Collapse All" className="p-1 hover:bg-muted-foreground/10 rounded">
                      <ChevronUp className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                    <button onClick={handleExpandAll} title="Expand All" className="p-1 hover:bg-muted-foreground/10 rounded">
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                  
                  {/* Date columns */}
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

              {/* Table Body with Drag & Drop */}
              <DndContext 
                sensors={sensors} 
                collisionDetection={closestCenter} 
                onDragStart={hasEdit ? handleDragStart : undefined}
                onDragOver={hasEdit ? handleDragOver : undefined}
                onDragEnd={hasEdit ? handleDragEnd : undefined}
              >
                <SortableContext 
                  items={currentEpicSegments.filter(s => !s.isContinuation).map(s => s.epic.id)} 
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col">
                    {currentEpicSegments.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground text-sm">
                        {isSearchActive ? `No tasks or epics match "${searchQuery}".` : "No rows found on this page."}
                      </div>
                    ) : (
                      currentEpicSegments.map((segment) => {
                        return (
                          <EpicSegmentGroup
                            key={segment.key}
                            segment={segment}
                            dates={dates}
                            holidays={holidays || []}
                            pics={projectPics}
                            overlapMap={overlapMap}
                            isExpanded={!collapsedEpicIds.has(segment.epic.id)}
                            onToggleExpand={() => toggleEpicExpanded(segment.epic.id)}
                            onEditEpic={(e: any) => { setEditingEpic(e); setIsEpicDialogOpen(true); }}
                            onDeleteEpic={handleDeleteEpic}
                            onAddTaskToEpic={(e: any) => { setEditingTask({ epicId: e.id }); setIsTaskDialogOpen(true); }}
                            onEditTask={(t: any) => { setEditingTask(t); setIsTaskDialogOpen(true); }}
                            onDeleteTask={handleDeleteTask}
                            onUpdateTaskStatus={handleUpdateTaskStatus}
                            onAssignToMe={handleAssignToMe}
                            onSetInReview={handleSetInReview}
                            onBackToTodo={handleBackToTodo}
                            hasEdit={hasEdit}
                            hasDelete={hasDelete}
                            taskStatuses={taskStatuses}
                            getStatusColor={getStatusColor}
                            colWidths={colWidths}
                            offsets={offsets}
                          />
                        );
                      })
                    )}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeId ? (
                    <div className="bg-primary/10 border-2 border-primary rounded p-4 shadow-xl opacity-90 font-bold text-primary">
                      Dragging item...
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </div>
        )}

        {/* Pagination Controls Bar */}
        {!isSearchActive && totalRows > 0 && (
          <div className="border-t bg-muted/40 px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs select-none shrink-0">
            {/* Left: Showing rows X–Y of Z */}
            <div className="text-muted-foreground font-medium">
              Showing rows <span className="font-semibold text-foreground">{startRow}</span>–<span className="font-semibold text-foreground">{endRow}</span> of <span className="font-semibold text-foreground">{totalRows}</span>
            </div>

            {/* Center: [← Prev] Page X of Y [Next →] */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={safeCurrentPage === 0}
                onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                className="h-8 px-2.5 text-xs gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </Button>
              <span className="font-medium text-foreground px-1">
                Page <span className="font-bold">{safeCurrentPage + 1}</span> of <span className="font-bold">{totalPages}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safeCurrentPage >= totalPages - 1}
                onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                className="h-8 px-2.5 text-xs gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Right: Per page buttons */}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground font-medium mr-1">Per page:</span>
              {[40, 60, 100].map((size) => (
                <Button
                  key={size}
                  variant={pageSize === size ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setPageSize(size);
                    setCurrentPage(0);
                  }}
                  className={cn("h-7 px-2.5 text-xs font-semibold", pageSize === size && "pointer-events-none font-bold")}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Search Active Notification Bar */}
        {isSearchActive && (
          <div className="border-t bg-muted/40 px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground shrink-0">
            <span>
              Showing all <strong className="text-foreground">{totalRows}</strong> matching rows (Pagination disabled during search)
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setCurrentPage(0);
              }}
              className="h-7 text-xs text-primary hover:text-primary gap-1"
            >
              <X className="w-3.5 h-3.5" /> Clear search
            </Button>
          </div>
        )}
      </PanelContent>
    </Panel>
  );
}
