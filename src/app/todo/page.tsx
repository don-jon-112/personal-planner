"use client";

import React, { useState, useMemo } from "react";
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
import { useCollection, useDeleteDocument } from "@/hooks/use-firestore";
import { TodoDialog } from "./todo-dialog";


export default function TodoPage() {
  const { data: todos, isLoading } = useCollection<any>("todos");
  const { mutate: deleteTodo } = useDeleteDocument("todos");
  
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

  const sortedTodos = useMemo(() => {
    if (!todos) return [];
    let sortableItems = [...todos];
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
    }
    return sortableItems;
  }, [todos, sortConfig]);

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
      <PanelHeader className="flex flex-row items-start justify-between border-b-0 pb-0">
        <div>
          <PanelTitle className="text-2xl font-bold text-secondary-foreground">Todo Plan</PanelTitle>
          <PanelDescription className="mt-1">Manage your daily tasks and backlog.</PanelDescription>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCreate} className="shadow-sm">
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
              ) : sortedTodos?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No tasks found.</TableCell>
                </TableRow>
              ) : (
                sortedTodos?.map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/20">
                    <TableCell className="font-medium">{item.task}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "px-2 py-1 rounded text-xs font-semibold",
                        item.priority === "High" ? "bg-destructive/10 text-destructive dark:text-red-400" :
                        item.priority === "Medium" ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" :
                        "bg-green-500/10 text-green-600 dark:text-green-400"
                      )}>
                        {item.priority}
                      </span>
                    </TableCell>
                    <TableCell>{item.deadline}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "px-2 py-1 rounded text-xs font-semibold",
                        item.status === "Todo" ? "bg-slate-500/10 text-slate-600 dark:text-slate-400" :
                        item.status === "Doing" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                        item.status === "Done" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                        "bg-red-500/10 text-red-600 dark:text-red-400"
                      )}>
                        {item.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-accent-foreground h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(item)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => {
                              if(confirm("Delete this task?")) {
                                deleteTodo(item.id);
                              }
                            }}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </PanelContent>
    </Panel>
  );
}
