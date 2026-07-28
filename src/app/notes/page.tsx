"use client";

import { useState } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, MoreHorizontal, Pin, Star } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCollection, useDeleteDocument, useUpdateDocument } from "@/hooks/use-firestore";
import { NoteDialog } from "./note-dialog";
import { NoteDetailDialog } from "./note-detail-dialog";
import "react-quill-new/dist/quill.snow.css";

export default function NotesPage() {
  const { data: notes, isLoading } = useCollection<any>("notes");
  const { mutate: deleteNote } = useDeleteDocument("notes");
  const { mutate: updateNote } = useUpdateDocument("notes");
  
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
        ) : notes?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
            No notes found. Start writing!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {notes?.map((note) => (
              <div 
                key={note.id} 
                className="group relative flex flex-col p-5 bg-card border border-border/50 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  setViewingNote(note);
                  setIsDetailOpen(true);
                }}
              >
                <div className="absolute top-4 right-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => togglePin(note)} className="text-muted-foreground hover:text-primary transition-colors">
                    <Pin className={cn("w-4 h-4", note.isPinned && "fill-primary text-primary")} />
                  </button>
                  <button onClick={() => toggleFavorite(note)} className="text-muted-foreground hover:text-yellow-500 transition-colors">
                    <Star className={cn("w-4 h-4", note.isFavorite && "fill-yellow-500 text-yellow-500")} />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(note)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => {
                          if(confirm("Delete this note?")) {
                            deleteNote(note.id);
                          }
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <h3 className="font-semibold text-lg text-secondary-foreground mb-2 pr-16 truncate">{note.title}</h3>
                
                {/* Rich text preview constrained in height with a fade-out effect */}
                <div className="relative flex-1 mb-4 h-[100px] overflow-hidden">
                  <div className="ql-snow rich-text-content">
                    <div 
                      className="ql-editor p-0 text-sm text-muted-foreground"
                      dangerouslySetInnerHTML={{ __html: note.content || "" }}
                    />
                  </div>
                  {/* Fade out gradient mask */}
                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
                </div>

                <div className="flex flex-wrap gap-2 mt-auto">
                  {note.tags?.map((tag: string) => (
                    <span key={tag} className="px-2 py-1 bg-muted/50 text-muted-foreground rounded text-xs">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </PanelContent>
    </Panel>
  );
}
