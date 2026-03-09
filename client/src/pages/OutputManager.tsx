import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, FolderOpen, FileText, Trash2, ExternalLink } from "lucide-react";

const MOCK_FILES = [
  { id: 1, name: "B7492.pdf", path: "f:\\scan-images\\B7492.pdf", date: "2023-10-25 14:32", pages: 3, size: "1.2 MB" },
  { id: 2, name: "SCAN_1042.pdf", path: "f:\\scan-images\\SCAN_1042.pdf", date: "2023-10-25 14:28", pages: 1, size: "450 KB" },
  { id: 3, name: "B8831.pdf", path: "f:\\scan-images\\B8831.pdf", date: "2023-10-25 11:15", pages: 5, size: "2.1 MB" },
  { id: 4, name: "SCAN_1041.pdf", path: "f:\\scan-images\\SCAN_1041.pdf", date: "2023-10-24 09:45", pages: 2, size: "890 KB" },
  { id: 5, name: "SCAN_1040.pdf", path: "f:\\scan-images\\SCAN_1040.pdf", date: "2023-10-24 09:42", pages: 12, size: "4.5 MB" },
];

export default function OutputManager() {
  const [search, setSearch] = useState("");

  const filteredFiles = MOCK_FILES.filter(file => 
    file.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 p-8 bg-slate-50 h-screen flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Output Manager</h1>
          <p className="text-muted-foreground mt-2">Manage and review captured documents in f:\scan-images\</p>
        </div>
        <Button variant="outline">
          <FolderOpen className="w-4 h-4 mr-2" />
          Open Output Folder
        </Button>
      </div>

      <Card className="flex-1 flex flex-col min-h-0 border-border shadow-sm">
        <div className="p-4 border-b flex items-center space-x-4 bg-white rounded-t-lg">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search files..." 
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-white rounded-b-lg">
          <Table>
            <TableHeader className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm">
              <TableRow>
                <TableHead className="w-[300px]">File Name</TableHead>
                <TableHead>Date Created</TableHead>
                <TableHead>Pages</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No files found matching your search.
                  </TableCell>
                </TableRow>
              ) : (
                filteredFiles.map((file) => (
                  <TableRow key={file.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-blue-500" />
                        <span>{file.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{file.date}</TableCell>
                    <TableCell>{file.pages}</TableCell>
                    <TableCell className="text-muted-foreground">{file.size}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Button variant="ghost" size="icon" title="Open File">
                          <ExternalLink className="w-4 h-4 text-slate-500" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Delete File" className="text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}