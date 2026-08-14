"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Plus, GripVertical, MoreHorizontal, CalendarClock } from "lucide-react";
import { useCollection, useDeleteDocument, useUpdateDocument } from "@/hooks/use-firestore";
import { EpicDialog } from "./epic-dialog";
import { TaskDialog } from "./task-dialog";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// -------------------------------------------------------------
// UI COMPONENTS
// -------------------------------------------------------------

function TaskRow({ task, dates, onEdit, onDelete }: { task: any, dates: Date[], onEdit: any, onDelete: any }) {
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
      <div className="w-[250px] sticky left-0 z-10 bg-background border-r shrink-0 flex items-center px-2 py-2">
        <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground mr-2 p-1">
          <GripVertical className="w-4 h-4" />
        </div>
        <span className="text-sm font-medium truncate pl-4 text-secondary-foreground">{task.name}</span>
      </div>
      <div className="w-[120px] sticky left-[250px] z-10 bg-background border-r shrink-0 flex items-center px-4 py-2 text-sm">
        {task.pic}
      </div>
      <div className="w-[60px] sticky left-[370px] z-10 bg-background border-r shrink-0 flex items-center justify-center px-2 py-2 text-sm font-mono">
        {task.md}
      </div>
      <div className="w-[50px] sticky left-[430px] z-10 bg-background border-r shrink-0 flex items-center justify-center px-2 py-2">
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
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <div 
              key={date.toISOString()} 
              className={cn(
                "w-[40px] shrink-0 border-r",
                isWeekend ? "bg-muted/30" : ""
              )}
            />
          );
        })}
        {/* Task Bar */}
        {(() => {
          // Find start index
          const startIndex = dates.findIndex(d => d.getTime() === taskStart.getTime());
          if (startIndex === -1) return null; // Outside of range
          
          return (
            <div 
              className="absolute top-2 h-[60%] bg-primary/80 rounded shadow-sm border border-primary/20 pointer-events-none"
              style={{
                left: `${startIndex * 40}px`,
                width: `${task.md * 40}px`,
              }}
            />
          );
        })()}
      </div>
    </div>
  );
}

function EpicGroup({ epic, tasks, dates, onEditEpic, onDeleteEpic, onEditTask, onDeleteTask }: any) {
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

  return (
    <div ref={setNodeRef} style={style} className={cn("flex flex-col bg-card", isDragging && "z-40 relative")}>
      {/* Epic Header Row */}
      <div className="flex border-b bg-muted/30 hover:bg-muted/50 transition-colors">
        <div className="w-[250px] sticky left-0 z-20 bg-muted/50 backdrop-blur-sm border-r shrink-0 flex items-center px-2 py-2">
          <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground mr-2 p-1">
            <GripVertical className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm uppercase tracking-wider truncate text-foreground">{epic.name}</span>
        </div>
        <div className="w-[120px] sticky left-[250px] z-20 bg-muted/50 backdrop-blur-sm border-r shrink-0 flex items-center px-4 py-2">
        </div>
        <div className="w-[60px] sticky left-[370px] z-20 bg-muted/50 backdrop-blur-sm border-r shrink-0 flex items-center justify-center px-2 py-2">
        </div>
        <div className="w-[50px] sticky left-[430px] z-20 bg-muted/50 backdrop-blur-sm border-r shrink-0 flex items-center justify-center px-2 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="p-1 text-muted-foreground hover:text-foreground rounded">
              <MoreHorizontal className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditEpic(epic)}>Edit Epic</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => onDeleteEpic(epic)}>Delete Epic</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Empty cells for epic row */}
        <div className="flex">
          {dates.map((date: Date) => (
            <div key={date.toISOString()} className={cn("w-[40px] shrink-0 border-r", (date.getDay() === 0 || date.getDay() === 6) && "bg-muted/50")} />
          ))}
        </div>
      </div>
      
      {/* Task List inside this Epic */}
      <SortableContext items={tasks.map((t: any) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col min-h-[10px]">
          {tasks.map((task: any) => (
            <TaskRow 
              key={task.id} 
              task={task} 
              dates={dates} 
              onEdit={onEditTask} 
              onDelete={onDeleteTask} 
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// -------------------------------------------------------------
// MAIN PAGE
// -------------------------------------------------------------

export default function TimelinePage() {
  const { data: rawEpics, isLoading: isLoadingEpics } = useCollection<any>("timelineEpics");
  const { data: rawTasks, isLoading: isLoadingTasks } = useCollection<any>("timelineTasks");

  const { mutate: deleteEpic } = useDeleteDocument("timelineEpics");
  const { mutate: updateEpic } = useUpdateDocument("timelineEpics");
  const { mutate: deleteTask } = useDeleteDocument("timelineTasks");
  const { mutate: updateTask } = useUpdateDocument("timelineTasks");

  const [orderedEpics, setOrderedEpics] = useState<any[]>([]);
  const [localTasks, setLocalTasks] = useState<any[]>([]);

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

  const [editingEpic, setEditingEpic] = useState<any>(null);
  const [isEpicDialogOpen, setIsEpicDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
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
        minDate.setDate(minDate.getDate() - 5); // Add some padding
        if (minDate < start) start = minDate;
        
        const maxDate = new Date(Math.max(...taskDates));
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
    <Panel className="h-full border-t-4 border-t-primary flex flex-col">
      <PanelHeader className="flex flex-row items-start justify-between border-b-0 pb-2">
        <div>
          <PanelTitle className="text-2xl font-bold text-secondary-foreground flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-primary" /> Timeline
          </PanelTitle>
          <PanelDescription className="mt-1">Plan and manage your project schedule with an Excel-like view.</PanelDescription>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setEditingEpic(null); setIsEpicDialogOpen(true); }} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            New Epic
          </Button>
          <Button onClick={() => { setEditingTask(null); setIsTaskDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </Button>
          <EpicDialog open={isEpicDialogOpen} onOpenChange={setIsEpicDialogOpen} epicToEdit={editingEpic} />
          <TaskDialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen} taskToEdit={editingTask} />
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
              
              {/* Header Row */}
              <div className="flex sticky top-0 z-30 bg-muted/80 backdrop-blur-md border-b shadow-sm">
                <div className="w-[250px] sticky left-0 z-40 bg-muted/90 backdrop-blur-md border-r shrink-0 px-4 py-3 font-semibold text-sm uppercase tracking-wider">Epic / Task</div>
                <div className="w-[120px] sticky left-[250px] z-40 bg-muted/90 backdrop-blur-md border-r shrink-0 px-4 py-3 font-semibold text-sm uppercase tracking-wider">PIC</div>
                <div className="w-[60px] sticky left-[370px] z-40 bg-muted/90 backdrop-blur-md border-r shrink-0 px-2 py-3 font-semibold text-sm uppercase tracking-wider text-center">MD</div>
                <div className="w-[50px] sticky left-[430px] z-40 bg-muted/90 backdrop-blur-md border-r shrink-0 px-2 py-3"></div>
                
                <div className="flex">
                  {dates.map((date) => {
                    const isToday = date.toDateString() === new Date().toDateString();
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    return (
                      <div 
                        key={date.toISOString()} 
                        className={cn(
                          "w-[40px] shrink-0 border-r flex flex-col items-center justify-center py-1 text-xs select-none",
                          isToday && "bg-primary/10 text-primary font-bold",
                          isWeekend && !isToday && "bg-muted/30"
                        )}
                      >
                        <span className={cn("font-medium", isToday ? "text-primary" : "text-muted-foreground")}>{date.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
                        <span>{date.getDate()}</span>
                      </div>
                    );
                  })}
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
                <SortableContext items={orderedEpics.map(e => e.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col">
                    {orderedEpics.map((epic) => {
                      const epicTasks = localTasks.filter(t => t.epicId === epic.id);
                      return (
                        <EpicGroup
                          key={epic.id}
                          epic={epic}
                          tasks={epicTasks}
                          dates={dates}
                          onEditEpic={(e: any) => { setEditingEpic(e); setIsEpicDialogOpen(true); }}
                          onDeleteEpic={(e: any) => confirm("Delete Epic and all tasks?") && deleteEpic(e.id)}
                          onEditTask={(t: any) => { setEditingTask(t); setIsTaskDialogOpen(true); }}
                          onDeleteTask={(t: any) => confirm("Delete Task?") && deleteTask(t.id)}
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
