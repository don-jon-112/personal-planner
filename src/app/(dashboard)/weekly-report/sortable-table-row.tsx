import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TableRow, TableCell } from "@/components/ui/table";
import { GripVertical, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SortableTableRow({
  report,
  onEdit,
  onDelete,
}: {
  report: any;
  onEdit: (report: any) => void;
  onDelete: (report: any) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: report.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  const formattedDate = report.date
    ? new Date(report.date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      })
    : "";

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        "hover:bg-muted/20 cursor-pointer",
        isDragging && "opacity-50 bg-muted"
      )}
      onClick={() => onEdit(report)}
    >
      <TableCell className="w-[40px] px-2 text-center" onClick={(e) => e.stopPropagation()}>
        <div
          className="cursor-grab hover:text-foreground text-muted-foreground flex justify-center"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap font-medium">
        {formattedDate}
      </TableCell>
      <TableCell
        className="font-medium text-secondary-foreground max-w-[120px] sm:max-w-[200px] md:max-w-[400px] lg:max-w-none truncate"
        title={report.task}
      >
        {report.task}
      </TableCell>
      <TableCell className="whitespace-nowrap">{report.team}</TableCell>
      <TableCell>
        <span
          className={cn(
            "px-2 py-1 rounded text-xs font-semibold",
            report.status === "Done"
              ? "bg-green-500/10 text-green-600"
              : report.status === "Planned"
              ? "bg-blue-500/10 text-blue-600"
              : report.status === "Blocked"
              ? "bg-destructive/10 text-destructive"
              : "bg-yellow-500/10 text-yellow-600"
          )}
        >
          {report.status}
        </span>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-accent-foreground h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(report)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => {
                if (confirm("Delete this report?")) {
                  onDelete(report);
                }
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
