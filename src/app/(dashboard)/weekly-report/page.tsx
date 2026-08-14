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
import { Search, MoreHorizontal, Plus, Filter } from "lucide-react";
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
import { useCollection, useDeleteDocument, useUpdateDocument } from "@/hooks/use-firestore";
import { WeeklyReportDialog } from "./report-dialog";
import { SortableTableRow } from "./sortable-table-row";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";


export default function WeeklyReportPage() {
  const { data: rawReports, isLoading } = useCollection<any>("weeklyReports");
  const { mutate: deleteReport } = useDeleteDocument("weeklyReports");
  const { mutate: updateReport } = useUpdateDocument("weeklyReports");

  const [orderedReports, setOrderedReports] = useState<any[]>([]);

  React.useEffect(() => {
    if (rawReports) {
      setOrderedReports([...rawReports].sort((a, b) => {
        const orderA = a.order ?? 0;
        const orderB = b.order ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        
        // Sort by date descending (newest first)
        const dateA = new Date(a.date || "").getTime();
        const dateB = new Date(b.date || "").getTime();
        return dateB - dateA;
      }));
    }
  }, [rawReports]);
  
  const [editingReport, setEditingReport] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);

  const toggleStatusFilter = (status: string) => {
    setStatusFilters(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const filteredReports = useMemo(() => {
    let result = orderedReports;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => 
        (r.task || "").toLowerCase().includes(q)
      );
    }
    if (statusFilters.length > 0) {
      result = result.filter(r => statusFilters.includes(r.status));
    }
    return result;
  }, [orderedReports, searchQuery, statusFilters]);

  const handleEdit = (report: any) => {
    setEditingReport(report);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingReport(null);
    setIsDialogOpen(true);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setOrderedReports((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        
        const newItems = arrayMove(items, oldIndex, newIndex);
        
        newItems.forEach((item, index) => {
          if (item.order !== index) {
            updateReport({ id: item.id, data: { order: index } });
          }
        });

        return newItems;
      });
    }
  }

  return (
    <Panel className="h-full border-t-4 border-t-primary">
      <PanelHeader className="flex flex-col sm:flex-row items-start justify-between border-b-0 pb-0 gap-4">
        <div className="w-full sm:w-auto">
          <PanelTitle className="text-2xl font-bold text-secondary-foreground">Weekly Report</PanelTitle>
          <PanelDescription className="mt-1">Summarize and track project progress per week.</PanelDescription>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={handleCreate} className="shadow-sm w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            New Report
          </Button>
          <WeeklyReportDialog 
            open={isDialogOpen} 
            onOpenChange={setIsDialogOpen} 
            reportToEdit={editingReport} 
          />
        </div>
      </PanelHeader>

      <PanelContent className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder="Search reports..." 
              className="pl-8 bg-muted/50 border-border"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 rounded-md px-3 text-xs w-full sm:w-auto">
                <Filter className="w-4 h-4 mr-2" />
                Filter {statusFilters.length > 0 && `(${statusFilters.length})`}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                  {['PLANNED', 'IN PROGRESS', 'DONE', 'BLOCKED'].map((status) => (
                    <DropdownMenuCheckboxItem
                      key={status}
                      checked={statusFilters.includes(status)}
                      onCheckedChange={() => toggleStatusFilter(status)}
                    >
                      {status}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="border border-border/50 rounded-md overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">Loading...</TableCell>
                </TableRow>
              ) : filteredReports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No reports found.</TableCell>
                </TableRow>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={filteredReports.map((r: any) => r.id)} strategy={verticalListSortingStrategy}>
                    {filteredReports.map((report: any) => (
                      <SortableTableRow
                        key={report.id}
                        report={report}
                        onEdit={handleEdit}
                        onDelete={(r) => deleteReport(r.id)}
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
