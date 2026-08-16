"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { CalendarClock, ChevronDown, ChevronUp, ChevronRight, PieChart, Filter, RefreshCw } from "lucide-react";
import { useCollection } from "@/hooks/use-firestore";
import { ChartsDialog } from "../(dashboard)/timeline/charts-dialog";
import { cn } from "@/lib/utils";
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

// Helpers for dates
function getDatesInRange(startDate: Date, endDate: Date) {
  const dates = [];
  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
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

function getDayStatus(date: Date, holidays: any[] = []) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  
  if (holidays.some((h: any) => h.date === dateStr)) return 'holiday';
  if (date.getDay() === 0 || date.getDay() === 6) return 'weekend';
  return false;
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

function TaskRow({ task, dates, holidays, pics }: { task: any, dates: Date[], holidays: any[], pics: any[] }) {
  const taskStart = new Date(task.startDate);
  taskStart.setHours(0,0,0,0);

  return (
    <div className="flex border-b hover:bg-muted/10 bg-background">
      <div className="w-[250px] md:sticky md:left-0 md:z-20 bg-background border-r shrink-0 flex items-center px-2 py-2 overflow-hidden">
        <TaskText text={task.name} className="text-sm font-medium text-secondary-foreground pl-2" />
      </div>
      <div className="w-[120px] md:sticky md:left-[250px] md:z-20 bg-background border-r shrink-0 flex items-center px-4 py-2 text-sm">
        {task.pic}
      </div>
      <div className="w-[120px] md:sticky md:left-[370px] md:z-20 bg-background border-r shrink-0 flex items-center justify-center px-2 py-2">
        <span className={cn(
          "text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider",
          task.status === "DONE" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
          task.status === "ON PROGRESS" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
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
          const startIndex = dates.findIndex(d => d.getTime() === taskStart.getTime());
          if (startIndex === -1) return null;
          
          let workingDays = 0;
          let currentIndex = startIndex;
          
          while (workingDays < task.md && currentIndex < dates.length) {
            const d = dates[currentIndex];
            if (!getDayStatus(d, holidays)) {
               workingDays++;
            }
            if (workingDays < task.md) {
               currentIndex++;
            }
          }
          
          const barWidthDays = (currentIndex - startIndex + 1);

          return (
            <div 
              className="absolute top-2 h-[60%] rounded shadow-sm pointer-events-none border border-black/10 z-0"
              style={{
                left: `${startIndex * 40}px`,
                width: `${barWidthDays * 40}px`,
                backgroundColor: getPicColor(task.pic, pics),
              }}
            />
          );
        })()}
      </div>
    </div>
  );
}

function EpicGroup({ epic, tasks, dates, holidays, pics, collapseAllTrigger, expandAllTrigger }: any) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  useEffect(() => {
    if (collapseAllTrigger > 0) setIsExpanded(false);
  }, [collapseAllTrigger]);

  useEffect(() => {
    if (expandAllTrigger > 0) setIsExpanded(true);
  }, [expandAllTrigger]);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t: any) => t.status === "DONE").length;
  const percentage = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

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
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function GuestTimelinePage() {
  const queryClient = useQueryClient();
  const { data: rawEpics, isLoading: isLoadingEpics, refetch: refetchEpics } = useCollection<any>("timelineEpics");
  const { data: rawTasks, isLoading: isLoadingTasks, refetch: refetchTasks } = useCollection<any>("timelineTasks");
  const { data: holidays, refetch: refetchHolidays } = useCollection<any>("timelineHolidays");
  const { data: pics, refetch: refetchPics } = useCollection<any>("timelinePics");

  const [isRefreshing, setIsRefreshing] = useState(false);

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

  useEffect(() => {
    if (rawEpics) {
      setOrderedEpics([...rawEpics].sort((a, b) => (a.order || 0) - (b.order || 0)));
    }
  }, [rawEpics]);

  useEffect(() => {
    if (rawTasks) {
      setLocalTasks([...rawTasks].sort((a, b) => (a.order || 0) - (b.order || 0)));
    }
  }, [rawTasks]);

  const dates = useMemo(() => {
    let start = new Date();
    start.setDate(1); 
    start.setHours(0,0,0,0);
    
    let end = new Date();
    end.setMonth(end.getMonth() + 2);
    end.setDate(0); 
    end.setHours(0,0,0,0);

    if (localTasks.length > 0) {
      const taskDates = localTasks.map(t => new Date(t.startDate).getTime()).filter(t => !isNaN(t));
      if (taskDates.length > 0) {
        const minDate = new Date(Math.min(...taskDates));
        minDate.setHours(0, 0, 0, 0);
        minDate.setDate(minDate.getDate() - 5);
        if (minDate < start) start = minDate;
        
        const maxDate = new Date(Math.max(...taskDates));
        maxDate.setHours(0, 0, 0, 0);
        maxDate.setDate(maxDate.getDate() + 30);
        if (maxDate > end) end = maxDate;
      }
    }
    
    return getDatesInRange(start, end);
  }, [localTasks]);

  return (
    <Panel className="h-[calc(100dvh-104px)] min-h-0 border-t-4 border-t-primary flex flex-col">
      <PanelHeader className="flex flex-col sm:flex-row items-start justify-between border-b-0 pb-2 gap-4 shrink-0">
        <div className="w-full sm:w-auto">
          <PanelTitle className="text-2xl font-bold text-secondary-foreground flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-primary" /> Timeline
          </PanelTitle>
          <PanelDescription className="mt-1">Read-only view of the project schedule.</PanelDescription>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row w-full sm:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "px-3 sm:px-4")}>
              <Filter className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">
                {selectedPicFilter === "ALL" ? "All PICs" : selectedPicFilter}
              </span>
              <span className="sm:hidden">
                {selectedPicFilter === "ALL" ? "Filter" : (selectedPicFilter || "").substring(0,4)}
              </span>
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
          <Button onClick={() => setIsChartsDialogOpen(true)} variant="outline" className="px-3 sm:px-4">
            <PieChart className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Analytics</span>
          </Button>
          <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline" className="px-3 sm:px-4">
            <RefreshCw className={cn("w-4 h-4 sm:mr-2", isRefreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
            <span className="sm:hidden">Sync</span>
          </Button>
          <ChartsDialog open={isChartsDialogOpen} onOpenChange={setIsChartsDialogOpen} tasks={localTasks} pics={pics} />
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
