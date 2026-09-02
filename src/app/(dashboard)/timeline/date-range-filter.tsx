"use client";

import React, { useState, useMemo } from "react";
import { 
  Calendar as CalendarIcon, 
  Check, 
  RotateCcw, 
  SlidersHorizontal,
  ChevronDown
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAlertModal } from "@/components/confirm-dialog-provider";

export type DateRangePreset = 
  | "auto" 
  | "this-month" 
  | "next-2-months" 
  | "next-3-months" 
  | "this-year" 
  | "custom";

export interface DateRangeConfig {
  preset: DateRangePreset;
  customStartDate?: string; // "YYYY-MM-DD"
  customEndDate?: string;   // "YYYY-MM-DD"
}

// Helpers
export function getDatesInRange(startDate: Date, endDate: Date) {
  const dates: Date[] = [];
  let currentDate = new Date(startDate);
  currentDate.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (currentDate <= end) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
}

export function computeTimelineDates(rangeConfig: DateRangeConfig, tasks: any[]): Date[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (rangeConfig.preset === "this-month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return getDatesInRange(start, end);
  }

  if (rangeConfig.preset === "next-2-months") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    return getDatesInRange(start, end);
  }

  if (rangeConfig.preset === "next-3-months") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 3, 0);
    return getDatesInRange(start, end);
  }

  if (rangeConfig.preset === "this-year") {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    return getDatesInRange(start, end);
  }

  if (rangeConfig.preset === "custom" && rangeConfig.customStartDate && rangeConfig.customEndDate) {
    const start = new Date(rangeConfig.customStartDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(rangeConfig.customEndDate);
    end.setHours(0, 0, 0, 0);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      return getDatesInRange(start, end);
    }
  }

  // Default "auto" (based on tasks or current 2 months)
  let start = new Date(now.getFullYear(), now.getMonth(), 1);
  let end = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  if (tasks.length > 0) {
    const taskDates = tasks
      .map((t) => new Date(t.startDate).getTime())
      .filter((t) => !isNaN(t));

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
}

interface DateRangeFilterProps {
  rangeConfig: DateRangeConfig;
  onChange: (config: DateRangeConfig) => void;
  tasks: any[];
}

export function DateRangeFilter({ rangeConfig, onChange, tasks }: DateRangeFilterProps) {
  const alertModal = useAlertModal();
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState(rangeConfig.customStartDate || "");
  const [customEnd, setCustomEnd] = useState(rangeConfig.customEndDate || "");

  // Label display
  const currentLabel = useMemo(() => {
    switch (rangeConfig.preset) {
      case "auto":
        return "Auto (Semua)";
      case "this-month":
        return "Bulan Ini";
      case "next-2-months":
        return "2 Bulan";
      case "next-3-months":
        return "3 Bulan";
      case "this-year":
        return "Tahun Ini";
      case "custom":
        if (rangeConfig.customStartDate && rangeConfig.customEndDate) {
          const s = new Date(rangeConfig.customStartDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
          const e = new Date(rangeConfig.customEndDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" });
          return `${s} - ${e}`;
        }
        return "Custom";
      default:
        return "Date Range";
    }
  }, [rangeConfig]);

  const handleApplyPreset = (preset: DateRangePreset) => {
    if (preset === "custom") return;
    onChange({ preset });
    setOpen(false);
  };

  const handleApplyCustom = async () => {
    if (!customStart || !customEnd) return;
    const s = new Date(customStart);
    const e = new Date(customEnd);
    if (s > e) {
      await alertModal({
        title: "Rentang Tanggal Tidak Valid",
        description: "Tanggal mulai tidak boleh melebihi tanggal selesai.",
        variant: "warning",
      });
      return;
    }
    onChange({
      preset: "custom",
      customStartDate: customStart,
      customEndDate: customEnd,
    });
    setOpen(false);
  };

  const handleResetToAuto = () => {
    onChange({ preset: "auto" });
    setCustomStart("");
    setCustomEnd("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "outline" }),
          "px-3 sm:px-4 flex items-center gap-1.5 font-medium cursor-pointer select-none",
          rangeConfig.preset !== "auto" && "border-primary/60 text-primary bg-primary/5"
        )}
      >
        <CalendarIcon className="w-4 h-4 text-primary shrink-0" />
        <span className="hidden md:inline truncate max-w-[150px]">{currentLabel}</span>
        <span className="md:hidden">Range</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60 ml-0.5" />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[320px] p-4 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pilihan Range</p>
            {rangeConfig.preset !== "auto" && (
              <button
                type="button"
                onClick={handleResetToAuto}
                className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Reset Auto
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Button
              type="button"
              variant={rangeConfig.preset === "auto" ? "default" : "outline"}
              size="sm"
              className="text-xs justify-start h-8"
              onClick={() => handleApplyPreset("auto")}
            >
              {rangeConfig.preset === "auto" && <Check className="w-3.5 h-3.5 mr-1" />}
              Auto (Semua)
            </Button>
            <Button
              type="button"
              variant={rangeConfig.preset === "this-month" ? "default" : "outline"}
              size="sm"
              className="text-xs justify-start h-8"
              onClick={() => handleApplyPreset("this-month")}
            >
              {rangeConfig.preset === "this-month" && <Check className="w-3.5 h-3.5 mr-1" />}
              Bulan Ini
            </Button>
            <Button
              type="button"
              variant={rangeConfig.preset === "next-2-months" ? "default" : "outline"}
              size="sm"
              className="text-xs justify-start h-8"
              onClick={() => handleApplyPreset("next-2-months")}
            >
              {rangeConfig.preset === "next-2-months" && <Check className="w-3.5 h-3.5 mr-1" />}
              2 Bulan
            </Button>
            <Button
              type="button"
              variant={rangeConfig.preset === "next-3-months" ? "default" : "outline"}
              size="sm"
              className="text-xs justify-start h-8"
              onClick={() => handleApplyPreset("next-3-months")}
            >
              {rangeConfig.preset === "next-3-months" && <Check className="w-3.5 h-3.5 mr-1" />}
              3 Bulan (Kuartal)
            </Button>
            <Button
              type="button"
              variant={rangeConfig.preset === "this-year" ? "default" : "outline"}
              size="sm"
              className="text-xs justify-start h-8 col-span-2"
              onClick={() => handleApplyPreset("this-year")}
            >
              {rangeConfig.preset === "this-year" && <Check className="w-3.5 h-3.5 mr-1" />}
              Sepanjang Tahun Ini
            </Button>
          </div>
        </div>

        <div className="border-t pt-3 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Custom Tanggal
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Dari Tanggal</Label>
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 text-xs px-2"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Sampai Tanggal</Label>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 text-xs px-2"
              />
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            className="w-full h-8 text-xs font-semibold"
            disabled={!customStart || !customEnd}
            onClick={handleApplyCustom}
          >
            Terapkan Range Custom
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
