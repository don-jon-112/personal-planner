"use client";

import { useState } from "react";
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
import { Search, MoreHorizontal, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCollection, useDeleteDocument } from "@/hooks/use-firestore";
import { GoLiveDialog } from "./golive-dialog";

export default function GoLivePage() {
  const { data: items, isLoading } = useCollection<any>("goliveChecks");
  const { mutate: deleteItem } = useDeleteDocument("goliveChecks");
  
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingItem(null);
    setIsDialogOpen(true);
  };

  return (
    <Panel className="h-full border-t-4 border-t-primary">
      <PanelHeader className="flex flex-col sm:flex-row items-start justify-between border-b-0 pb-0 gap-4">
        <div className="w-full sm:w-auto">
          <PanelTitle className="text-2xl font-bold text-secondary-foreground">Go Live Check</PanelTitle>
          <PanelDescription className="mt-1">Tracking readiness status of system components.</PanelDescription>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={handleCreate} className="shadow-sm w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
          <GoLiveDialog 
            open={isDialogOpen} 
            onOpenChange={setIsDialogOpen} 
            itemToEdit={editingItem} 
          />
        </div>
      </PanelHeader>

      <PanelContent className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search checklist..." className="pl-8 bg-muted/50 border-border" />
          </div>
        </div>

        <div className="border border-border/50 rounded-md overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>PIC</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">Loading...</TableCell>
                </TableRow>
              ) : items?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No checklist items found.</TableCell>
                </TableRow>
              ) : (
                items?.map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/20">
                    <TableCell className="font-medium text-secondary-foreground">{item.title}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "px-2 py-1 rounded text-xs font-semibold",
                        item.status === "Done" ? "bg-green-500/10 text-green-600" :
                        item.status === "Pending" ? "bg-yellow-500/10 text-yellow-600" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {item.status}
                      </span>
                    </TableCell>
                    <TableCell>{item.pic}</TableCell>
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
                              if(confirm("Delete this item?")) {
                                deleteItem(item.id);
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
