"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Plus, GripVertical, MoreHorizontal, CalendarClock, ChevronDown, ChevronRight, PieChart, Filter } from "lucide-react";
import { useCollection, useDeleteDocument, useUpdateDocument } from "@/hooks/use-firestore";
import { EpicDialog } from "./epic-dialog";
import { TaskDialog } from "./task-dialog";
import { HolidaysDialog } from "./holidays-dialog";
import { PicsDialog } from "./pics-dialog";
import { ChartsDialog } from "./charts-dialog";
import { cn } from "@/lib/utils";
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

// -------------------------------------------------------------
// UI COMPONENTS
// -------------------------------------------------------------

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

function TaskRow({ task, dates, holidays, pics, onEdit, onDelete, onUpdateStatus }: { task: any, dates: Date[], holidays: any[], pics: any[], onEdit: any, onDelete: any, onUpdateStatus: any }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { type: "Task", task } });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const taskStart = new Date(task.startDate);
  taskStart.setHours(0,0,0,0);

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={cn("flex border-b hover:bg-muted/10 bg-background", isDragging && "z-50 relative")}
    >
      <div className="w-[250px] md:sticky md:left-0 md:z-20 bg-background border-r shrink-0 flex items-center px-2 py-2 overflow-hidden">
        <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground mr-2 p-1 z-10 bg-background">
          <GripVertical className="w-4 h-4" />
        </div>
        <TaskText text={task.name} className="text-sm font-medium text-secondary-foreground pl-2" />
      </div>
      <div className="w-[120px] md:sticky md:left-[250px] md:z-20 bg-background border-r shrink-0 flex items-center px-4 py-2 text-sm">
        {task.pic}
      </div>
      <div className="w-[120px] md:sticky md:left-[370px] md:z-20 bg-background border-r shrink-0 flex items-center justify-center px-2 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="focus:outline-none">
            <span className={cn(
              "text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider",
              task.status === "DONE" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
              task.status === "ON PROGRESS" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
              "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
            )}>
              {task.status || "TODO"}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onClick={() => onUpdateStatus(task.id, "TODO")}>TODO</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onUpdateStatus(task.id, "ON PROGRESS")}>ON PROGRESS</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onUpdateStatus(task.id, "DONE")}>DONE</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="w-[60px] md:sticky md:left-[490px] md:z-20 bg-background border-r shrink-0 flex items-center justify-center px-2 py-2 text-sm font-mono">
        {task.md}
      </div>
      <div className="w-[50px] md:sticky md:left-[550px] md:z-20 bg-background border-r shrink-0 flex items-center justify-center px-2 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="p-1 text-muted-foreground hover:text-foreground rounded">
            <MoreHorizontal className="w-4 h-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(task)}>Edit Task</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(task)}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
          // Find start index
          const startIndex = dates.findIndex(d => d.getTime() === taskStart.getTime());
          if (startIndex === -1) return null; // Outside of range
          
          let workingDays = 0;
          let currentIndex = startIndex;
          
          // Loop through dates to find the end index based on MD (working days)
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

function EpicGroup({ epic, tasks, dates, holidays, pics, onEditEpic, onDeleteEpic, onEditTask, onDeleteTask, onUpdateTaskStatus, onAddTaskToEpic, collapseAllTrigger }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: epic.id, data: { type: "Epic", epic } });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [isExpanded, setIsExpanded] = useState(true);
  
  useEffect(() => {
    if (collapseAllTrigger > 0) {
      setIsExpanded(false);
    }
  }, [collapseAllTrigger]);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t: any) => t.status === "DONE").length;
  const percentage = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

  return (
    <div ref={setNodeRef} style={style} className={cn("flex flex-col bg-card", isDragging && "z-40 relative")}>
      {/* Epic Header Row */}
      <div 
        className="flex border-b bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="w-[550px] md:sticky md:left-0 md:z-20 bg-muted border-r shrink-0 flex items-center px-2 py-2">
          <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground mr-2 p-1" onClick={(e) => e.stopPropagation()}>
            <GripVertical className="w-4 h-4" />
          </div>
          <button className="mr-1 text-muted-foreground hover:text-foreground focus:outline-none p-1">
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
        <div className="w-[50px] md:sticky md:left-[550px] md:z-20 bg-muted border-r shrink-0 flex items-center justify-center px-2 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="p-1 text-muted-foreground hover:text-foreground rounded" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddTaskToEpic(epic); }}>Add Task</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEditEpic(epic); }}>Edit Epic</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); onDeleteEpic(epic); }}>Delete Epic</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
        <SortableContext items={tasks.map((t: any) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col min-h-[10px]">
            {tasks.map((task: any) => (
              <TaskRow 
                key={task.id} 
                task={task} 
                dates={dates} 
                holidays={holidays}
                pics={pics}
                onEdit={onEditTask} 
                onDelete={onDeleteTask}
                onUpdateStatus={onUpdateTaskStatus}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// MAIN PAGE
// -------------------------------------------------------------

export default function TimelinePage() {
  const { data: rawEpics, isLoading: isLoadingEpics } = useCollection<any>("timelineEpics");
  const { data: rawTasks, isLoading: isLoadingTasks } = useCollection<any>("timelineTasks");
  const { data: holidays } = useCollection<any>("timelineHolidays");
  const { data: pics } = useCollection<any>("timelinePics");
  const { mutateAsync: updateEpic } = useUpdateDocument("timelineEpics");
  const { mutateAsync: updateTask } = useUpdateDocument("timelineTasks");
  const { mutateAsync: deleteEpic } = useDeleteDocument("timelineEpics");
  const { mutateAsync: deleteTask } = useDeleteDocument("timelineTasks");

  const [isEpicDialogOpen, setIsEpicDialogOpen] = useState(false);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isHolidaysDialogOpen, setIsHolidaysDialogOpen] = useState(false);
  const [isPicsDialogOpen, setIsPicsDialogOpen] = useState(false);
  const [isChartsDialogOpen, setIsChartsDialogOpen] = useState(false);
  const [collapseAllTrigger, setCollapseAllTrigger] = useState(0);
  
  const [editingEpic, setEditingEpic] = useState<any>(null);
  const [editingTask, setEditingTask] = useState<any>(null);

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      await updateTask({ id: taskId, data: { status: newStatus } });
    } catch (e) {
      console.error(e);
    }
  };

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


  const [activeId, setActiveId] = useState<string | null>(null);

  const dates = useMemo(() => {
    // Dynamic date range based on tasks, or default to current month
    let start = new Date();
    start.setDate(1); // First day of current month
    start.setHours(0,0,0,0);
    
    let end = new Date();
    end.setMonth(end.getMonth() + 2);
    end.setDate(0); // Last day of next month
    end.setHours(0,0,0,0);

    if (localTasks.length > 0) {
      const taskDates = localTasks.map(t => new Date(t.startDate).getTime()).filter(t => !isNaN(t));
      if (taskDates.length > 0) {
        const minDate = new Date(Math.min(...taskDates));
        minDate.setHours(0, 0, 0, 0);
        minDate.setDate(minDate.getDate() - 5); // Add some padding
        if (minDate < start) start = minDate;
        
        const maxDate = new Date(Math.max(...taskDates));
        maxDate.setHours(0, 0, 0, 0);
        // Add max MD to maxDate roughly (assume max 30)
        maxDate.setDate(maxDate.getDate() + 30);
        if (maxDate > end) end = maxDate;
      }
    }
    
    return getDatesInRange(start, end);
  }, [localTasks]);

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
          // We can't really arrayMove here easily, we just update epicId and it jumps to the bottom of that epic
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
      // Find where it landed in the local state
      const taskInState = localTasks.find(t => t.id === active.id);
      if (!taskInState) return;

      const currentEpicId = taskInState.epicId;
      
      // If dropped on another task
      if (overData?.type === "Task" && active.id !== over.id) {
        setLocalTasks(prev => {
          const oldIndex = prev.findIndex(t => t.id === active.id);
          const newIndex = prev.findIndex(t => t.id === over.id);
          const newItems = arrayMove(prev, oldIndex, newIndex);
          
          // Persist all tasks in this epic to firestore
          const epicTasks = newItems.filter(t => t.epicId === currentEpicId);
          epicTasks.forEach((item, index) => {
             updateTask({ id: item.id, data: { order: index, epicId: currentEpicId } });
          });
          
          return newItems;
        });
      } else {
        // Just persist the new epicId if it changed but order within list didn't change via arrayMove over another task
        const epicTasks = localTasks.filter(t => t.epicId === currentEpicId);
        epicTasks.forEach((item, index) => {
            updateTask({ id: item.id, data: { order: index, epicId: currentEpicId } });
        });
      }
    }
  };

  return (
    <Panel className="h-[calc(100dvh-104px)] min-h-0 border-t-4 border-t-primary flex flex-col">
      <PanelHeader className="flex flex-col sm:flex-row items-start justify-between border-b-0 pb-2 gap-4 shrink-0">
        <div className="w-full sm:w-auto">
          <PanelTitle className="text-2xl font-bold text-secondary-foreground flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-primary" /> Timeline
          </PanelTitle>
          <PanelDescription className="mt-1">Plan and manage your project schedule with an Excel-like view.</PanelDescription>
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
          <Button onClick={() => setIsHolidaysDialogOpen(true)} variant="outline" className="px-3 sm:px-4">
            <span className="hidden sm:inline">Holidays</span>
            <span className="sm:hidden">Hol</span>
          </Button>
          <Button onClick={() => setIsPicsDialogOpen(true)} variant="outline" className="px-3 sm:px-4">
            <span className="hidden sm:inline">PICs</span>
            <span className="sm:hidden">PICs</span>
          </Button>
          <Button onClick={() => setCollapseAllTrigger(prev => prev + 1)} variant="outline" className="px-3 sm:px-4">
            <span className="hidden sm:inline">Collapse All</span>
            <span className="sm:hidden">Collapse</span>
          </Button>
          <Button onClick={() => { setEditingEpic(null); setIsEpicDialogOpen(true); }} variant="outline" className="px-3 sm:px-4">
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">New Epic</span>
          </Button>
          <Button onClick={() => { setEditingTask(null); setIsTaskDialogOpen(true); }} className="px-3 sm:px-4">
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">New Task</span>
          </Button>
          <EpicDialog open={isEpicDialogOpen} onOpenChange={setIsEpicDialogOpen} epicToEdit={editingEpic} />
          <TaskDialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen} taskToEdit={editingTask} />
          <HolidaysDialog open={isHolidaysDialogOpen} onOpenChange={setIsHolidaysDialogOpen} />
          <PicsDialog open={isPicsDialogOpen} onOpenChange={setIsPicsDialogOpen} />
          <ChartsDialog open={isChartsDialogOpen} onOpenChange={setIsChartsDialogOpen} tasks={localTasks} />
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
          <div className="flex-1 overflow-auto bg-card relative custom-scrollbar">
            <div className="min-w-max flex flex-col">
              
              <div className="flex flex-col sticky top-0 z-30 shadow-sm bg-background">
                {/* Month Row */}
                <div className="flex bg-muted border-b">
                  <div className="w-[600px] md:sticky md:left-0 md:z-40 bg-muted border-r shrink-0" />
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
                  <div className="w-[60px] md:sticky md:left-[490px] md:z-40 bg-muted border-r shrink-0 px-2 py-2 font-semibold text-sm uppercase tracking-wider flex items-center justify-center">MD</div>
                  <div className="w-[50px] md:sticky md:left-[550px] md:z-40 bg-muted border-r shrink-0 px-2 py-2"></div>
                  
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
              <DndContext 
                sensors={sensors} 
                collisionDetection={closestCenter} 
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={filteredOrderedEpics.map(e => e.id)} strategy={verticalListSortingStrategy}>
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
                          onEditEpic={(e: any) => { setEditingEpic(e); setIsEpicDialogOpen(true); }}
                          onDeleteEpic={(e: any) => confirm("Delete Epic and all tasks?") && deleteEpic(e.id)}
                          onAddTaskToEpic={(e: any) => { setEditingTask({ epicId: e.id }); setIsTaskDialogOpen(true); }}
                          onEditTask={(t: any) => { setEditingTask(t); setIsTaskDialogOpen(true); }}
                          onDeleteTask={(t: any) => confirm("Delete Task?") && deleteTask(t.id)}
                          onUpdateTaskStatus={handleUpdateTaskStatus}
                          collapseAllTrigger={collapseAllTrigger}
                        />
                      );
                    })}
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
      </PanelContent>
    </Panel>
  );
}
