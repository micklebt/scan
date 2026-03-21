import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ExternalLink, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function BarcodeLookup() {
  const queryClient = useQueryClient();
  const [barcode, setBarcode] = useState("");
  const [vendor, setVendor] = useState("");
  const [keywords, setKeywords] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ barcodeValue: string; fileName: string } | null>(null);

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["/api/index", barcode, vendor, keywords, fromDate, toDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (barcode) params.set("barcode", barcode);
      if (vendor) params.set("vendor", vendor);
      if (keywords) params.set("keywords", keywords);
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const qs = params.toString();
      return apiRequest("GET", `/api/index${qs ? `?${qs}` : ""}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (barcodeValue: string) => apiRequest("DELETE", `/api/jobs/by-barcode/${encodeURIComponent(barcodeValue)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/index"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "File Deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex-1 p-8 bg-slate-50 h-screen flex flex-col">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Barcode Lookup</h1>
        <p className="text-muted-foreground mt-2">Find a document instantly by barcode label.</p>
      </div>

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Barcode (optional)"
              className="pl-9"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value.toUpperCase())}
            />
          </div>
          <Input
            placeholder="Vendor / customer name"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
          <Input
            placeholder="Keywords (2-6 words)"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <div className="flex items-center">
            <Badge variant="secondary">{isFetching ? "Searching..." : `${rows.length} result(s)`}</Badge>
          </div>
        </div>
      </Card>

      <Card className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor / Customer</TableHead>
              <TableHead>Doc Date</TableHead>
              <TableHead>Description (2-6 words)</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Total Amount Due</TableHead>
              <TableHead>File</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                  No barcode matches found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row: any) => {
                return (
                  <TableRow key={row.id}>
                    <TableCell>{row.customerName || "-"}</TableCell>
                    <TableCell>{row.docDate || "-"}</TableCell>
                    <TableCell>{row.summary || "-"}</TableCell>
                    <TableCell>{row.accountNumber || "-"}</TableCell>
                    <TableCell>{row.totalAmount || "-"}</TableCell>
                    <TableCell className="font-medium">{row.fileName}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <a href={`/api/jobs/${row.scanJobId}/open`} target="_blank" rel="noreferrer">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Retrieve and Open
                          </a>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget({ barcodeValue: row.barcodeValue, fileName: row.fileName })}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `This will permanently delete ${deleteTarget.fileName}.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteTarget) return;
                deleteMutation.mutate(deleteTarget.barcodeValue);
                setDeleteTarget(null);
              }}
              disabled={deleteMutation.isPending}
            >
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
