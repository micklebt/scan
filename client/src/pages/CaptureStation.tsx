import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Printer,
  Settings,
  Save,
  RefreshCcw,
  FileText,
  ZoomIn,
  ZoomOut,
  Trash2,
  Copy,
  CheckSquare,
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

interface ScannedPage {
  id: string;
  dataUrl: string;
  blob: Blob;
  selected: boolean;
  pageNumber: number;
}

export default function CaptureStation() {
  const queryClient = useQueryClient();
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);

  const [dpi, setDpi] = useState("300");
  const [colorMode, setColorMode] = useState("color");
  const [duplex, setDuplex] = useState(false);
  const [paperSize, setPaperSize] = useState("letter");
  const [source, setSource] = useState("feeder");

  const [barcodeDetected, setBarcodeDetected] = useState(false);
  const [detectedBarcode, setDetectedBarcode] = useState("B7492");

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

  const nextSeq = seqData?.nextSeq ?? 1;
  const currentFileName = barcodeDetected ? detectedBarcode : `SCAN_${nextSeq.toString().padStart(4, "0")}`;
  const savePath = settings?.savePath ?? "f:\\scan-images\\";

  const defaultScanner = scanners.find((s: any) => s.isDefault) ?? scanners[0];
  const scannerDisplay = defaultScanner ? `${defaultScanner.name} (${defaultScanner.ip})` : "No scanner configured";

  const handleScan = () => {
    setIsScanning(true);
    setScanProgress(0);
    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);

          const canvas = document.createElement("canvas");
          canvas.width = 612;
          canvas.height = 792;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, 612, 792);
          ctx.fillStyle = "#333333";
          ctx.font = "20px sans-serif";
          ctx.fillText(`Scanned Page ${pages.length + 1}`, 50, 100);
          ctx.font = "14px sans-serif";
          ctx.fillStyle = "#666666";
          ctx.fillText(`Scanner: ${scannerDisplay}`, 50, 140);
          ctx.fillText(`DPI: ${dpi} | Color: ${colorMode} | Duplex: ${duplex ? "Yes" : "No"}`, 50, 170);
          ctx.fillText(`Paper: ${paperSize} | Source: ${source}`, 50, 200);
          ctx.fillText(`Date: ${new Date().toLocaleString()}`, 50, 240);
          if (barcodeDetected) {
            ctx.font = "bold 24px monospace";
            ctx.fillStyle = "#000000";
            ctx.fillText(`||||| ${detectedBarcode} |||||`, 50, 320);
          }

          canvas.toBlob((blob) => {
            if (!blob) return;
            const dataUrl = canvas.toDataURL("image/png");
            const newId = Math.random().toString(36).substring(7);
            const newPage: ScannedPage = {
              id: newId,
              dataUrl,
              blob,
              selected: true,
              pageNumber: pages.length + 1,
            };
            setPages((current) => [...current, newPage]);
            setActivePageId(newId);
            setIsScanning(false);
            toast({ title: "Scan Complete", description: `Captured page ${pages.length + 1}` });
          }, "image/png");

          return 100;
        }
        return prev + 15;
      });
    }, 200);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const selectedPages = pages.filter((p) => p.selected);
      const formData = new FormData();
      selectedPages.forEach((page, idx) => {
        formData.append("pages", page.blob, `page_${idx}.png`);
      });
      if (barcodeDetected) formData.append("barcodeValue", detectedBarcode);
      formData.append("scannerName", defaultScanner?.name ?? "Sharp MX-M503N");
      formData.append("dpi", dpi);
      formData.append("colorMode", colorMode);
      formData.append("duplex", duplex.toString());
      return apiRequest("POST", "/api/scan", formData);
    },
    onSuccess: (job) => {
      toast({ title: "PDF Saved", description: `${job.fileName} saved to ${savePath}` });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/next-seq"] });
      setPages([]);
      setActivePageId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSelectAll = () => {
    const allSelected = pages.every((p) => p.selected);
    setPages(pages.map((p) => ({ ...p, selected: !allSelected })));
  };

  const toggleSelection = (id: string) => {
    setPages(pages.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)));
  };

  const handleDeleteSelected = () => {
    const remaining = pages.filter((p) => !p.selected);
    const updated = remaining.map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
    setPages(updated);
    if (activePageId && !updated.find((p) => p.id === activePageId)) {
      setActivePageId(updated.length > 0 ? updated[0].id : null);
    }
    toast({ title: "Pages Deleted", description: "Removed selected pages." });
  };

  const handleSavePDF = () => {
    const selectedCount = pages.filter((p) => p.selected).length;
    if (selectedCount === 0) {
      toast({ title: "No pages selected", description: "Please select at least one page to save.", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  };

  const activePage = pages.find((p) => p.id === activePageId);

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
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
          <Badge variant="outline" className="px-3 py-1 font-mono text-xs" data-testid="text-scanner-badge">
            {scannerDisplay}
          </Badge>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <span className="flex w-2 h-2 rounded-full bg-green-500"></span>
            <span>Connected</span>
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
                  disabled={isScanning}
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
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <Label htmlFor="barcode-detect" className="cursor-pointer font-semibold text-primary">3of9 Barcode Detected</Label>
                    <Switch id="barcode-detect" checked={barcodeDetected} onCheckedChange={setBarcodeDetected} />
                  </div>
                  {barcodeDetected && (
                    <div className="space-y-2">
                      <Label htmlFor="detected-barcode" className="text-xs">Barcode Value</Label>
                      <Input id="detected-barcode" value={detectedBarcode} onChange={(e) => setDetectedBarcode(e.target.value)} className="h-8 font-mono text-sm" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Target Directory</Label>
                    <Input value={savePath} readOnly className="bg-slate-100 text-slate-500 font-mono text-xs" />
                  </div>
                  <div className="pt-2 text-xs text-muted-foreground flex items-center space-x-1">
                    <FileText className="w-3 h-3" />
                    <span>Output File: <strong>{currentFileName}.pdf</strong></span>
                  </div>
                  <Button
                    variant="default"
                    className="w-full bg-slate-800 hover:bg-slate-900 text-white mt-2"
                    onClick={handleSavePDF}
                    disabled={pages.length === 0 || saveMutation.isPending}
                    data-testid="button-save-pdf"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saveMutation.isPending ? "Saving..." : "Save to Local Drive"}
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>
        </aside>

        <section className="flex-1 flex flex-col bg-slate-100 relative shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between p-3 bg-white/80 backdrop-blur-md border-b border-border shadow-sm absolute top-0 left-0 right-0 z-10">
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" onClick={handleSelectAll} disabled={pages.length === 0}>
                <CheckSquare className="w-4 h-4 mr-2" />Select All
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDeleteSelected} disabled={pages.length === 0 || !pages.some((p) => p.selected)}>
                <Trash2 className="w-4 h-4 mr-2" />Delete Selected
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="icon" disabled={!activePage}><ZoomOut className="w-4 h-4" /></Button>
              <span className="text-sm font-medium w-12 text-center">100%</span>
              <Button variant="ghost" size="icon" disabled={!activePage}><ZoomIn className="w-4 h-4" /></Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-8 pt-20 pb-40">
            {pages.length === 0 ? (
              <div className="text-center space-y-4 text-muted-foreground max-w-md">
                <div className="w-24 h-24 mx-auto bg-slate-200 rounded-full flex items-center justify-center">
                  <FileText className="w-12 h-12 text-slate-400" />
                </div>
                <h3 className="text-xl font-medium text-slate-600">No Documents Captured</h3>
                <p className="text-sm">Click "Capture Document" to start scanning from the connected workstation device.</p>
              </div>
            ) : activePage ? (
              <div className="relative group transition-all duration-300 shadow-[0_10px_40px_rgba(0,0,0,0.1)] hover:shadow-[0_15px_50px_rgba(0,0,0,0.15)] bg-white max-w-3xl w-full mx-auto" style={{ aspectRatio: "3/4" }}>
                <img src={activePage.dataUrl} alt={`Page ${activePage.pageNumber}`} className="w-full h-full object-contain pointer-events-none" />
                <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md">Page {activePage.pageNumber}</div>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="w-64 flex flex-col border-l border-border bg-card z-10 flex-shrink-0">
          <div className="p-4 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-sm">Document Pages ({pages.length})</h2>
            <p className="text-xs text-muted-foreground">{pages.filter((p) => p.selected).length} selected</p>
          </div>
          <ScrollArea className="flex-1 p-4">
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
          </ScrollArea>
        </aside>
      </main>
    </div>
  );
}
