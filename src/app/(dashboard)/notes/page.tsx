"use client";

import React, { useState, useEffect } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
import { useCollection, useDeleteDocument, useUpdateDocument } from "@/hooks/use-firestore";
import { NoteDialog } from "./note-dialog";
import { NoteDetailDialog } from "./note-detail-dialog";
import { SortableNoteItem } from "./sortable-note-item";
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
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import "react-quill-new/dist/quill.snow.css";

export default function NotesPage() {
  const { data: rawNotes, isLoading } = useCollection<any>("notes");
  const { mutate: deleteNote } = useDeleteDocument("notes");
  const { mutate: updateNote } = useUpdateDocument("notes");

  const [orderedNotes, setOrderedNotes] = useState<any[]>([]);

  useEffect(() => {
    if (rawNotes) {
      setOrderedNotes([...rawNotes].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (a.order || 0) - (b.order || 0);
      }));
    }
  }, [rawNotes]);
  
  const [editingNote, setEditingNote] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const [viewingNote, setViewingNote] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const handleEdit = (note: any) => {
    setEditingNote(note);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingNote(null);
    setIsDialogOpen(true);
  };

  const togglePin = (note: any) => {
    updateNote({ id: note.id, data: { isPinned: !note.isPinned } });
  };

  const toggleFavorite = (note: any) => {
    updateNote({ id: note.id, data: { isFavorite: !note.isFavorite } });
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
      setOrderedNotes((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        
        const activeItem = items[oldIndex];
        const overItem = items[newIndex];
        
        // Prevent moving pinned items into unpinned or vice-versa
        if (activeItem.isPinned !== overItem.isPinned) {
          return items;
        }

        const newItems = arrayMove(items, oldIndex, newIndex);
        
        // Update order in firestore for the affected group
        const groupItems = newItems.filter(i => i.isPinned === activeItem.isPinned);
        
        groupItems.forEach((item, index) => {
          if (item.order !== index) {
            updateNote({ id: item.id, data: { order: index } });
          }
        });

        return newItems;
      });
    }
  }

  return (
    <Panel className="h-full border-t-4 border-t-primary">
      <PanelHeader className="flex flex-row items-start justify-between border-b-0 pb-0">
        <div>
          <PanelTitle className="text-2xl font-bold text-secondary-foreground">Notes & Ideas</PanelTitle>
          <PanelDescription className="mt-1">Capture your thoughts, meetings, and brilliant ideas.</PanelDescription>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCreate} className="shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            New Note
          </Button>
          <NoteDialog 
            open={isDialogOpen} 
            onOpenChange={setIsDialogOpen} 
            noteToEdit={editingNote} 
          />
          <NoteDetailDialog
            open={isDetailOpen}
            onOpenChange={setIsDetailOpen}
            note={viewingNote}
          />
        </div>
      </PanelHeader>

      <PanelContent className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search notes..." className="pl-8 bg-muted/50 border-border" />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading notes...</div>
        ) : orderedNotes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
            No notes found. Start writing!
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedNotes.map(n => n.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {orderedNotes.map((note) => (
                  <SortableNoteItem
                    key={note.id}
                    note={note}
                    onView={(n) => {
                      setViewingNote(n);
                      setIsDetailOpen(true);
                    }}
                    onEdit={handleEdit}
                    onDelete={(n) => deleteNote(n.id)}
                    onTogglePin={togglePin}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </PanelContent>
    </Panel>
  );
}
