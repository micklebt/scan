import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, FolderOpen, FileText, Trash2, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function OutputManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["/api/jobs", search],
    queryFn: () => apiRequest("GET", `/api/jobs${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/jobs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "File Deleted", description: "The scan job and file have been removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleDownload = (id: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = `/api/jobs/${id}/download`;
    link.download = fileName;
    link.click();
  };

  return (
    <div className="flex-1 p-8 bg-slate-50 h-screen flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Output Manager</h1>
          <p className="text-muted-foreground mt-2">Manage and review captured documents</p>
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
              data-testid="input-search-files"
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-white rounded-b-lg">
          <Table>
            <TableHeader className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm">
              <TableRow>
                <TableHead className="w-[250px]">File Name</TableHead>
                <TableHead>Target Path</TableHead>
                <TableHead>Date Created</TableHead>
                <TableHead>Pages</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    {search ? "No files found matching your search." : "No scanned documents yet. Capture some pages first!"}
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job: any) => (
                  <TableRow key={job.id} className="hover:bg-slate-50/50 transition-colors" data-testid={`row-job-${job.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-blue-500" />
                        <span data-testid={`text-filename-${job.id}`}>{job.fileName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{job.filePath}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{job.pageCount}</TableCell>
                    <TableCell className="text-muted-foreground">{formatBytes(job.fileSize)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Button variant="ghost" size="icon" title="Download PDF" onClick={() => handleDownload(job.id, job.fileName)} data-testid={`button-download-${job.id}`}>
                          <Download className="w-4 h-4 text-slate-500" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Delete File" className="text-destructive hover:bg-destructive/10" onClick={() => deleteMutation.mutate(job.id)} data-testid={`button-delete-job-${job.id}`}>
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
