import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Plus, Search, Pin, Star } from "lucide-react";

const mockNotes = [
  { id: 1, title: "Meeting Notes - Sprint Planning", category: "Meeting", pinned: true, favorite: false },
  { id: 2, title: "Architecture Design", category: "Design", pinned: false, favorite: true },
];

export default function NotesPage() {
  return (
    <div className="p-8 space-y-6 flex flex-col h-full">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Notes</h2>
          <p className="text-muted-foreground mt-1">Your simple workspace for thoughts and markdown notes.</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Note
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input type="search" placeholder="Search notes..." className="pl-8" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockNotes.map((note) => (
          <Card key={note.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="flex flex-row justify-between items-start pb-2">
              <div>
                <CardTitle className="text-lg">{note.title}</CardTitle>
                <CardDescription className="mt-1">{note.category}</CardDescription>
              </div>
              <div className="flex gap-2">
                {note.pinned && <Pin className="w-4 h-4 text-muted-foreground fill-muted-foreground" />}
                {note.favorite && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-3">
                Preview of the note content goes here...
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
