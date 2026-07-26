"use client";

import { useState } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
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
import { Search, MoreHorizontal, Plus } from "lucide-react";
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
                <TableHead>Task Name</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">Loading...</TableCell>
                </TableRow>
              ) : todos?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No tasks found.</TableCell>
                </TableRow>
              ) : (
                todos?.map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/20">
                    <TableCell className="font-medium">{item.task}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "px-2 py-1 rounded text-xs font-semibold",
                        item.priority === "High" ? "bg-destructive/10 text-destructive" :
                        item.priority === "Medium" ? "bg-yellow-500/10 text-yellow-600" :
                        "bg-green-500/10 text-green-600"
                      )}>
                        {item.priority}
                      </span>
                    </TableCell>
                    <TableCell>{item.deadline}</TableCell>
                    <TableCell>{item.status}</TableCell>
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
