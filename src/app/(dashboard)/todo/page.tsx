"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Search, MoreHorizontal, Plus, ArrowUpDown } from "lucide-react";
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
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

import { useCollection, useDeleteDocument, useUpdateBatch } from "@/hooks/use-firestore";
import { TodoDialog } from "./todo-dialog";
import { SortableTodoRow } from "./sortable-todo-row";


export default function TodoPage() {
  const { data: todos, isLoading } = useCollection<any>("todos");
  const { mutate: deleteTodo } = useDeleteDocument("todos");
  const { mutate: batchUpdate } = useUpdateBatch("todos");
  
  const [localTodos, setLocalTodos] = useState<any[]>([]);
  const [editingTodo, setEditingTodo] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Sync local todos when firestore data changes (for optimistic updates)
  useEffect(() => {
    if (todos) {
      setLocalTodos(todos);
    }
  }, [todos]);

  const sortedTodos = useMemo(() => {
    let sortableItems = [...localTodos];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aVal = a[sortConfig.key] || "";
        let bVal = b[sortConfig.key] || "";
        
        // Custom priority sort
        if (sortConfig.key === 'priority') {
          const pMap: Record<string, number> = { "High": 3, "Medium": 2, "Low": 1 };
          aVal = pMap[aVal as string] || 0;
          bVal = pMap[bVal as string] || 0;
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default sort by orderIndex (ascending)
      sortableItems.sort((a, b) => {
        const orderA = a.orderIndex ?? Date.now();
        const orderB = b.orderIndex ?? Date.now();
        return orderA - orderB;
      });
    }
    return sortableItems;
  }, [localTodos, sortConfig]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = sortedTodos.findIndex((t) => t.id === active.id);
      const newIndex = sortedTodos.findIndex((t) => t.id === over.id);
      
      const newOrder = arrayMove(sortedTodos, oldIndex, newIndex);
      
      // Optimistically update UI
      setLocalTodos(newOrder);

      // Recalculate orderIndex for everything (simple integer spacing)
      const updates = newOrder.map((item, index) => ({
        id: item.id,
        data: { orderIndex: index * 1000 }
      }));
      
      batchUpdate(updates);
    }
  };

  const isDragDisabled = sortConfig !== null; // Disable DND if custom sorted

  const handleEdit = (todo: any) => {
    setEditingTodo(todo);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingTodo(null);
    setIsDialogOpen(true);
  };

  return (
    <Panel className="h-full border-t-4 border-t-primary">
      <PanelHeader className="flex flex-col sm:flex-row items-start justify-between border-b-0 pb-0 gap-4">
        <div className="w-full sm:w-auto">
          <PanelTitle className="text-2xl font-bold text-secondary-foreground">Todo Plan</PanelTitle>
          <PanelDescription className="mt-1">Manage your daily tasks and backlog.</PanelDescription>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={handleCreate} className="shadow-sm w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            New Todo
          </Button>
          <TodoDialog 
            open={isDialogOpen} 
            onOpenChange={setIsDialogOpen} 
            todoToEdit={editingTodo} 
          />
        </div>
      </PanelHeader>

      <PanelContent className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search tasks..." className="pl-8 bg-muted/50 border-border" />
          </div>
        </div>

        <div className="border border-border/50 rounded-md overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead onClick={() => requestSort('task')} className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">Task Name <ArrowUpDown className="w-3 h-3" /></div>
                </TableHead>
                <TableHead onClick={() => requestSort('priority')} className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">Priority <ArrowUpDown className="w-3 h-3" /></div>
                </TableHead>
                <TableHead onClick={() => requestSort('deadline')} className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">Deadline <ArrowUpDown className="w-3 h-3" /></div>
                </TableHead>
                <TableHead onClick={() => requestSort('status')} className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">Status <ArrowUpDown className="w-3 h-3" /></div>
                </TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">Loading...</TableCell>
                </TableRow>
              ) : sortedTodos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No tasks found.</TableCell>
                </TableRow>
              ) : (
                <DndContext 
                  sensors={sensors} 
                  collisionDetection={closestCenter} 
                  onDragEnd={handleDragEnd}
                  modifiers={[restrictToVerticalAxis]}
                >
                  <SortableContext 
                    items={sortedTodos.map(t => t.id)} 
                    strategy={verticalListSortingStrategy}
                  >
                    {sortedTodos.map((item) => (
                      <SortableTodoRow 
                        key={item.id}
                        item={item}
                        handleEdit={handleEdit}
                        deleteTodo={deleteTodo}
                        isDragDisabled={isDragDisabled}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </TableBody>
          </Table>
        </div>
      </PanelContent>
    </Panel>
  );
}
