import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Printer,
  Settings,
  RefreshCcw,
  FileText,
  ZoomIn,
  ZoomOut,
  Trash2,
  CheckSquare,
  CircleHelp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/api";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ScannedPage {
  id: string;
  dataUrl: string;
  blob: Blob;
  selected: boolean;
  pageNumber: number;
}

interface CapturedJob {
  id: string;
  fileName: string;
  pageCount: number;
  createdAt: string;
  docDate?: string | null;
  customerName?: string | null;
  accountNumber?: string | null;
  totalAmount?: string | null;
  notes?: string | null;
  metadataJson?: Record<string, unknown> | null;
}

type MetadataDraft = {
  docDate: string;
  customerName: string;
  accountNumber: string;
  totalAmount: string;
  notes: string;
};

type MetadataJsonShape = Partial<MetadataDraft> & { approved?: boolean };

function parseMetadataJson(raw: unknown): MetadataJsonShape {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") return parsed as MetadataJsonShape;
      return {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as MetadataJsonShape;
  return {};
}

function firstNonEmpty(...values: Array<unknown>): string {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

export default function CaptureStation() {
  const queryClient = useQueryClient();
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [capturedJobs, setCapturedJobs] = useState<CapturedJob[]>([]);
  const [activeCapturedJobId, setActiveCapturedJobId] = useState<string | null>(null);
  const [activeCapturedPage, setActiveCapturedPage] = useState(1);
  const [selectedCapturedJobIds, setSelectedCapturedJobIds] = useState<string[]>([]);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [metadataQueue, setMetadataQueue] = useState<CapturedJob[]>([]);
  const [activeMetadataJob, setActiveMetadataJob] = useState<CapturedJob | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft>({
    docDate: "",
    customerName: "",
    accountNumber: "",
    totalAmount: "",
    notes: "",
  });

  const [dpi, setDpi] = useState("600");
  const [colorMode, setColorMode] = useState("bw");
  const [duplex, setDuplex] = useState(false);
  const [paperSize, setPaperSize] = useState("letter");
  const [source, setSource] = useState("feeder");

  const { data: scanners = [] } = useQuery({
    queryKey: ["/api/scanners"],
    queryFn: () => apiRequest("GET", "/api/scanners"),
  });

  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
    queryFn: () => apiRequest("GET", "/api/settings"),
  });

  const { data: seqData } = useQuery({
    queryKey: ["/api/settings/next-seq"],
    queryFn: () => apiRequest("GET", "/api/settings/next-seq"),
  });
  const { data: scannerStatus } = useQuery({
    queryKey: ["/api/scanner/status"],
    queryFn: () => apiRequest("GET", "/api/scanner/status"),
  });

  const nextSeq = seqData?.nextSeq ?? 1;
  const currentFileName = `no-code-${nextSeq.toString().padStart(2, "0")} (or Bxxxx)`;
  const savePath = settings?.savePath ?? "f:\\scan-images\\";

  const defaultScanner = scanners.find((s: any) => s.isDefault) ?? scanners[0];
  const scannerDisplay = defaultScanner ? `${defaultScanner.name} (${defaultScanner.ip})` : "No scanner configured";

  const loadMetadataModal = (job: CapturedJob | null) => {
    setActiveMetadataJob(job);
    if (!job) return;
    const meta = parseMetadataJson(job.metadataJson);
    const baseName = (job.fileName || "").replace(/\.pdf$/i, "");
    setMetadataDraft({
      docDate: firstNonEmpty(job.docDate, meta.docDate),
      customerName: firstNonEmpty(job.customerName, meta.customerName, (meta as Record<string, unknown>).sourceName),
      accountNumber: firstNonEmpty(job.accountNumber, meta.accountNumber, baseName),
      totalAmount: firstNonEmpty(job.totalAmount, meta.totalAmount),
      notes: firstNonEmpty(job.notes, meta.notes),
    });
  };

  const openMetadataModalForJob = async (job: CapturedJob | null) => {
    if (!job) {
      loadMetadataModal(null);
      return;
    }
    try {
      const fresh = await apiRequest("GET", `/api/jobs/${job.id}`);
      const merged = { ...job, ...fresh } as CapturedJob;
      loadMetadataModal(merged);
    } catch {
      loadMetadataModal(job);
    }
  };

  const handleScan = () => {
    if (!scannerStatus?.ready) {
      toast({
        title: "Scanner Not Ready",
        description: scannerStatus?.message || "Configure TWAIN_SCAN_COMMAND before starting real capture.",
        variant: "destructive",
      });
      return;
    }

    setIsScanning(true);
    setScanProgress(0);
    const interval = setInterval(() => {
      setScanProgress((prev) => (prev >= 90 ? 90 : prev + 10));
    }, 200);

    apiRequest("POST", "/api/scan/real", {
      barcodeValue: null,
      scannerName: defaultScanner?.name ?? scannerStatus?.scannerName ?? "Sharp MX-M503N",
      dpi,
      colorMode,
      duplex,
      paperSize,
      source,
    })
      .then((result) => {
        clearInterval(interval);
        setScanProgress(100);
        setPages([]);
        setActivePageId(null);
        setSelectedCapturedJobIds([]);
        const jobs = Array.isArray(result?.jobs) ? result.jobs : [result];
        setCapturedJobs(jobs);
        setActiveCapturedJobId(jobs.length > 0 ? jobs[0].id : null);
        setActiveCapturedPage(1);
        setMetadataQueue(jobs);
        void openMetadataModalForJob(jobs.length > 0 ? jobs[0] : null);
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        queryClient.invalidateQueries({ queryKey: ["/api/settings/next-seq"] });
        if (jobs.length === 1) {
          toast({ title: "Scan Complete", description: `${jobs[0].fileName} saved to ${savePath}` });
        } else {
          toast({ title: "Scan Complete", description: `${jobs.length} documents saved to ${savePath}` });
        }
      })
      .catch((err: Error) => {
        clearInterval(interval);
        toast({ title: "Scan Failed", description: err.message, variant: "destructive" });
      })
      .finally(() => {
        setIsScanning(false);
        setScanProgress(0);
      });
  };

  const saveMetadataMutation = useMutation({
    mutationFn: async (payload: { id: string; approved: boolean; data: MetadataDraft }) => {
      return apiRequest("PATCH", `/api/jobs/${payload.id}/metadata`, {
        ...payload.data,
        approved: payload.approved,
      });
    },
    onSuccess: (updated: CapturedJob) => {
      setCapturedJobs((current) => current.map((job) => (job.id === updated.id ? { ...job, ...updated } : job)));
      setMetadataQueue((current) => {
        const remaining = current.slice(1);
        void openMetadataModalForJob(remaining.length > 0 ? remaining[0] : null);
        return remaining;
      });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
    onError: (err: Error) => {
      toast({ title: "Metadata Save Failed", description: err.message, variant: "destructive" });
    },
  });

  const moveToNextMetadataJob = () => {
    setMetadataQueue((current) => {
      const remaining = current.slice(1);
      void openMetadataModalForJob(remaining.length > 0 ? remaining[0] : null);
      return remaining;
    });
  };

  const deleteCapturedMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await apiRequest("DELETE", `/api/jobs/${id}`);
      }
    },
    onSuccess: () => {
      const remaining = capturedJobs.filter((job) => !selectedCapturedJobIds.includes(job.id));
      setCapturedJobs(remaining);
      setSelectedCapturedJobIds([]);
      if (activeCapturedJobId && !remaining.some((job) => job.id === activeCapturedJobId)) {
        setActiveCapturedJobId(remaining.length > 0 ? remaining[0].id : null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Documents Deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSelectAll = () => {
    if (pages.length > 0) {
      const allSelected = pages.every((p) => p.selected);
      setPages(pages.map((p) => ({ ...p, selected: !allSelected })));
      return;
    }
    if (capturedJobs.length > 0) {
      const allSelected = selectedCapturedJobIds.length === capturedJobs.length;
      setSelectedCapturedJobIds(allSelected ? [] : capturedJobs.map((job) => job.id));
    }
  };

  const toggleSelection = (id: string) => {
    setPages(pages.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)));
  };

  const handleDeleteSelected = () => {
    if (pages.length === 0 && selectedCapturedJobIds.length > 0) {
      deleteCapturedMutation.mutate(selectedCapturedJobIds);
      return;
    }
    const remaining = pages.filter((p) => !p.selected);
    const updated = remaining.map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
    setPages(updated);
    if (activePageId && !updated.find((p) => p.id === activePageId)) {
      setActivePageId(updated.length > 0 ? updated[0].id : null);
    }
    toast({ title: "Pages Deleted", description: "Removed selected pages." });
  };

  const activePage = pages.find((p) => p.id === activePageId);
  const activeCapturedJob = capturedJobs.find((job) => job.id === activeCapturedJobId) || null;
  const canZoom = Boolean(activePage || activeCapturedJob);
  const selectCapturedJob = (id: string) => {
    setActiveCapturedJobId(id);
    setActiveCapturedPage(1);
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <Dialog open={Boolean(activeMetadataJob)} onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Metadata for {activeMetadataJob?.fileName}</DialogTitle>
            <DialogDescription>
              Edit JSON values for hard-coded keys, then choose Save or Approve and Save.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>docDate</Label>
              <Input value={metadataDraft.docDate} onChange={(e) => setMetadataDraft((p) => ({ ...p, docDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>customerName</Label>
              <Input value={metadataDraft.customerName} onChange={(e) => setMetadataDraft((p) => ({ ...p, customerName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>accountNumber</Label>
              <Input value={metadataDraft.accountNumber} onChange={(e) => setMetadataDraft((p) => ({ ...p, accountNumber: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>totalAmount</Label>
              <Input value={metadataDraft.totalAmount} onChange={(e) => setMetadataDraft((p) => ({ ...p, totalAmount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>notes</Label>
              <Textarea value={metadataDraft.notes} onChange={(e) => setMetadataDraft((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={moveToNextMetadataJob}
              disabled={!activeMetadataJob || saveMetadataMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => activeMetadataJob && saveMetadataMutation.mutate({ id: activeMetadataJob.id, approved: true, data: metadataDraft })}
              disabled={!activeMetadataJob || saveMetadataMutation.isPending || !metadataDraft.notes.trim()}
            >
              Approve and Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-border shadow-sm z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground" data-testid="text-app-title">DocuCapture Pro</h1>
            <p className="text-xs text-muted-foreground">Workstation Scanner Interface</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" asChild>
            <a href="/api/help" target="_blank" rel="noreferrer">
              <CircleHelp className="w-4 h-4 mr-2" />
              Help
            </a>
          </Button>
          <Badge variant="outline" className="px-3 py-1 font-mono text-xs" data-testid="text-scanner-badge">
            {scannerDisplay}
          </Badge>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <span
              className={`flex w-2 h-2 rounded-full ${
                scannerStatus?.ready ? "bg-green-500" : "bg-red-500"
              }`}
            ></span>
            <span>{scannerStatus?.ready ? "Connected" : "Not Connected"}</span>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <aside className="w-80 flex flex-col border-r border-border bg-card shadow-sm z-10 flex-shrink-0">
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-8">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Settings className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Scan Profile</h2>
                </div>
                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scanner Status</span>
                    <span className={`text-xs font-semibold ${scannerStatus?.ready ? "text-green-600" : "text-red-600"}`}>
                      {scannerStatus?.ready ? "Ready" : "Not Ready"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {scannerStatus?.message || "Checking scanner status..."}
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="paper-size">Paper Size</Label>
                      <Select value={paperSize} onValueChange={setPaperSize}>
                        <SelectTrigger id="paper-size"><SelectValue placeholder="Size" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="letter">Letter (8.5x11")</SelectItem>
                          <SelectItem value="legal">Legal (8.5x14")</SelectItem>
                          <SelectItem value="a4">A4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="source">Source</Label>
                      <Select value={source} onValueChange={setSource}>
                        <SelectTrigger id="source"><SelectValue placeholder="Source" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="feeder">Sheet Feeder</SelectItem>
                          <SelectItem value="flatbed">Flatbed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dpi">Resolution</Label>
                      <Select value={dpi} onValueChange={setDpi}>
                        <SelectTrigger id="dpi"><SelectValue placeholder="DPI" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="150">150 DPI</SelectItem>
                          <SelectItem value="300">300 DPI</SelectItem>
                          <SelectItem value="600">600 DPI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="color">Color Mode</Label>
                      <Select value={colorMode} onValueChange={setColorMode}>
                        <SelectTrigger id="color"><SelectValue placeholder="Mode" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="color">Color</SelectItem>
                          <SelectItem value="grayscale">Grayscale</SelectItem>
                          <SelectItem value="bw">B&W</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <Label htmlFor="duplex" className="cursor-pointer">Duplex Scanning</Label>
                    <Switch id="duplex" checked={duplex} onCheckedChange={setDuplex} />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Button
                  size="lg"
                  className="w-full h-14 text-lg font-medium shadow-md transition-all active:scale-[0.98]"
                  onClick={handleScan}
                  disabled={isScanning || !scannerStatus?.ready}
                  data-testid="button-scan"
                >
                  {isScanning ? (
                    <><RefreshCcw className="w-5 h-5 mr-2 animate-spin" />Scanning...</>
                  ) : (
                    <><Printer className="w-5 h-5 mr-2" />Capture Document</>
                  )}
                </Button>
                {isScanning && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Receiving from scanner...</span>
                      <span>{scanProgress}%</span>
                    </div>
                    <Progress value={scanProgress} className="h-2" />
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Output Settings</h2>
                <div className="space-y-4 bg-muted/30 p-3 rounded-lg border border-border">
                  <div className="space-y-2">
                    <Label>Target Directory</Label>
                    <Input value={savePath} readOnly className="bg-slate-100 text-slate-500 font-mono text-xs" />
                  </div>
                  <div className="pt-1 text-xs text-muted-foreground flex items-center space-x-1">
                    <FileText className="w-3 h-3" />
                    <span>Output File: <strong>{currentFileName}.pdf</strong></span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Auto-save is enabled. Documents are saved immediately after scan.
                    Barcode naming uses Code39 `Bxxxx`; fallback is `no-code-xx.pdf`.
                  </p>
                </div>
              </div>
            </div>
          </ScrollArea>
        </aside>

        <section className="flex-1 flex flex-col bg-slate-100 relative shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between p-3 bg-white/80 backdrop-blur-md border-b border-border shadow-sm absolute top-0 left-0 right-0 z-10">
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" onClick={handleSelectAll} disabled={pages.length === 0 && capturedJobs.length === 0}>
                <CheckSquare className="w-4 h-4 mr-2" />Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleDeleteSelected}
                disabled={(pages.length > 0 && !pages.some((p) => p.selected)) || (pages.length === 0 && selectedCapturedJobIds.length === 0)}
              >
                <Trash2 className="w-4 h-4 mr-2" />Delete Selected
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoomPercent((z) => Math.max(25, z - 25))}
                disabled={!canZoom || zoomPercent <= 25}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium w-20 text-center">
                {zoomPercent}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoomPercent((z) => Math.min(300, z + 25))}
                disabled={!canZoom || zoomPercent >= 300}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex items-start justify-center p-8 pt-20 pb-40">
            {pages.length === 0 && capturedJobs.length === 0 ? (
              <div className="text-center space-y-4 text-muted-foreground max-w-md">
                <div className="w-24 h-24 mx-auto bg-slate-200 rounded-full flex items-center justify-center">
                  <FileText className="w-12 h-12 text-slate-400" />
                </div>
                <h3 className="text-xl font-medium text-slate-600">No Documents Captured</h3>
                <p className="text-sm">Click "Capture Document" to start scanning from the connected workstation device.</p>
              </div>
            ) : pages.length > 0 && activePage ? (
              <div className="relative group transition-all duration-300 shadow-[0_10px_40px_rgba(0,0,0,0.1)] hover:shadow-[0_15px_50px_rgba(0,0,0,0.15)] bg-white w-full mx-auto overflow-y-auto overflow-x-hidden flex justify-center items-start">
                <img
                  src={activePage.dataUrl}
                  alt={`Page ${activePage.pageNumber}`}
                  className="h-auto object-contain pointer-events-none max-w-none"
                  style={{ width: `${zoomPercent}%` }}
                />
                <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md">Page {activePage.pageNumber}</div>
              </div>
            ) : activeCapturedJob ? (
              <div className="w-full h-full bg-white rounded-lg border shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold">{activeCapturedJob.fileName}</h3>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveCapturedPage((p) => Math.max(1, p - 1))}
                      disabled={activeCapturedPage <= 1}
                    >
                      Prev
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {activeCapturedPage} / {activeCapturedJob.pageCount}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveCapturedPage((p) => Math.min(activeCapturedJob.pageCount, p + 1))}
                      disabled={activeCapturedPage >= activeCapturedJob.pageCount}
                    >
                      Next
                    </Button>
                  </div>
                </div>
                <div className="w-full h-[calc(100%-2.5rem)] border rounded bg-slate-50 overflow-y-auto overflow-x-hidden flex items-start justify-center">
                  <img
                    src={`/api/jobs/${activeCapturedJob.id}/page/${activeCapturedPage}`}
                    alt={`${activeCapturedJob.fileName} page ${activeCapturedPage}`}
                    className="h-auto object-contain max-w-none"
                    style={{ width: `${zoomPercent}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="w-64 flex flex-col border-l border-border bg-card z-10 flex-shrink-0">
          <div className="p-4 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-sm">
              {pages.length > 0 ? `Document Pages (${pages.length})` : `Captured Documents (${capturedJobs.length})`}
            </h2>
            <p className="text-xs text-muted-foreground">
              {pages.length > 0
                ? `${pages.filter((p) => p.selected).length} selected`
                : `${selectedCapturedJobIds.length} selected`}
            </p>
          </div>
          <ScrollArea className="flex-1 p-4">
            {pages.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 pb-20">
                {pages.map((page) => (
                  <div
                    key={page.id}
                    className={`relative group cursor-pointer rounded-md overflow-hidden border-2 transition-all ${page.id === activePageId ? "ring-2 ring-primary border-transparent" : "border-transparent hover:border-primary/50"} ${page.selected ? "bg-primary/5" : "bg-muted/30"}`}
                    onClick={() => setActivePageId(page.id)}
                  >
                    <div className="aspect-[3/4] p-1">
                      <img src={page.dataUrl} className="w-full h-full object-cover rounded-sm shadow-sm bg-white" alt={`Thumbnail ${page.pageNumber}`} />
                    </div>
                    <div
                      className={`absolute top-2 left-2 w-5 h-5 rounded border bg-white/90 backdrop-blur flex items-center justify-center ${page.selected ? "border-primary bg-primary text-white" : "border-slate-300 opacity-0 group-hover:opacity-100"} transition-opacity`}
                      onClick={(e) => { e.stopPropagation(); toggleSelection(page.id); }}
                    >
                      {page.selected && <CheckSquare className="w-3 h-3" />}
                    </div>
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] text-center py-1 font-medium backdrop-blur-sm">{page.pageNumber}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2 pb-20">
                {capturedJobs.map((job) => (
                  <div
                    key={job.id}
                    className={`rounded-md border p-2 text-xs cursor-pointer transition-colors ${
                      activeCapturedJobId === job.id
                        ? "bg-primary/10 border-primary shadow-sm"
                        : "bg-muted/30 hover:bg-muted/50"
                    }`}
                    onClick={() => selectCapturedJob(job.id)}
                  >
                    <div className="aspect-[4/3] mb-2 rounded border overflow-hidden bg-white flex items-center justify-center">
                      <img
                        src={`/api/jobs/${job.id}/page/1?thumb=1`}
                        alt={`${job.fileName} thumbnail`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${job.fileName}`}
                        checked={selectedCapturedJobIds.includes(job.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelectedCapturedJobIds((current) =>
                            current.includes(job.id)
                              ? current.filter((id) => id !== job.id)
                              : [...current, job.id],
                          );
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{job.fileName}</div>
                        <div className="mt-1 flex items-center gap-1">
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            {job.pageCount} page{job.pageCount === 1 ? "" : "s"}
                          </Badge>
                          {activeCapturedJobId === job.id && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              Viewing
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </aside>
      </main>
    </div>
  );
}
