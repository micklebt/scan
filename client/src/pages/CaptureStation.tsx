import { useState, useRef, useEffect } from "react";
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
  FolderOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

// Mock data for initial states
const MOCK_SCANNERS = [
  "Fujitsu fi-7160",
  "Epson ScanSnap iX1600",
  "HP WorkForce DS-530II"
];

interface ScannedPage {
  id: string;
  url: string;
  selected: boolean;
  pageNumber: number;
}

export default function CaptureStation() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  
  // Settings state
  const [selectedScanner, setSelectedScanner] = useState(MOCK_SCANNERS[0]);
  const [dpi, setDpi] = useState("300");
  const [colorMode, setColorMode] = useState("color");
  const [duplex, setDuplex] = useState(false);
  const [fileName, setFileName] = useState("Scan_" + new Date().toISOString().split('T')[0]);

  // Tree.bin bucket state
  const mockBuckets = ["Bucket_001", "Bucket_002", "Bucket_042", "Bucket_105", "Bucket_999"];
  const [selectedBucket, setSelectedBucket] = useState(mockBuckets[0]);
  const [isReadingTree, setIsReadingTree] = useState(false);

  // Handle mock scanning process
  const handleScan = () => {
    setIsScanning(true);
    setScanProgress(0);
    
    // Simulate scan progress
    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          
          // Add new mocked page
          const newId = Math.random().toString(36).substring(7);
          const newPage = {
            id: newId,
            url: "/images/sample-invoice.png",
            selected: true,
            pageNumber: pages.length + 1
          };
          
          setPages((currentPages) => [...currentPages, newPage]);
          setActivePageId(newId);
          setIsScanning(false);
          toast({
            title: "Scan Complete",
            description: "Successfully captured 1 page from " + selectedScanner,
          });
          return 100;
        }
        return prev + 15;
      });
    }, 200);
  };

  const handleSelectAll = () => {
    const allSelected = pages.every(p => p.selected);
    setPages(pages.map(p => ({ ...p, selected: !allSelected })));
  };

  const toggleSelection = (id: string) => {
    setPages(pages.map(p => p.id === id ? { ...p, selected: !p.selected } : p));
  };

  const handleDeleteSelected = () => {
    const remaining = pages.filter(p => !p.selected);
    // Re-number pages
    const updated = remaining.map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
    setPages(updated);
    if (activePageId && !updated.find(p => p.id === activePageId)) {
      setActivePageId(updated.length > 0 ? updated[0].id : null);
    }
    toast({
      title: "Pages Deleted",
      description: `Removed selected pages.`,
    });
  };

  const handleSavePDF = () => {
    const selectedCount = pages.filter(p => p.selected).length;
    if (selectedCount === 0) {
      toast({
        title: "No pages selected",
        description: "Please select at least one page to save.",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Saving PDF...",
      description: `Saving ${selectedCount} pages to undisclosed directory as ${selectedBucket}.pdf`,
    });
    
    // In a real app, this would trigger the actual save process
    setTimeout(() => {
      toast({
        title: "Success",
        description: `File saved successfully to secure target.`,
        variant: "default"
      });
    }, 1500);
  };

  const activePage = pages.find(p => p.id === activePageId);

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-border shadow-sm z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">DocuCapture Pro</h1>
            <p className="text-xs text-muted-foreground">Workstation Scanner Interface</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <Badge variant="outline" className="px-3 py-1 font-mono text-xs">
            {selectedScanner}
          </Badge>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <span className="flex w-2 h-2 rounded-full bg-green-500"></span>
            <span>API Connected</span>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex flex-1 overflow-hidden">
        
        {/* Left Sidebar - Settings & Actions */}
        <aside className="w-80 flex flex-col border-r border-border bg-card shadow-sm z-10 flex-shrink-0">
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-8">
              
              {/* Scan Settings */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Settings className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Scan Profile</h2>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="scanner">Device</Label>
                    <Select value={selectedScanner} onValueChange={setSelectedScanner}>
                      <SelectTrigger id="scanner">
                        <SelectValue placeholder="Select scanner" />
                      </SelectTrigger>
                      <SelectContent>
                        {MOCK_SCANNERS.map(scanner => (
                          <SelectItem key={scanner} value={scanner}>{scanner}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dpi">Resolution</Label>
                      <Select value={dpi} onValueChange={setDpi}>
                        <SelectTrigger id="dpi">
                          <SelectValue placeholder="DPI" />
                        </SelectTrigger>
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
                        <SelectTrigger id="color">
                          <SelectValue placeholder="Mode" />
                        </SelectTrigger>
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

              {/* Main Actions */}
              <div className="space-y-4">
                <Button 
                  size="lg" 
                  className="w-full h-14 text-lg font-medium shadow-md transition-all active:scale-[0.98]"
                  onClick={handleScan}
                  disabled={isScanning}
                  data-testid="button-scan"
                >
                  {isScanning ? (
                    <>
                      <RefreshCcw className="w-5 h-5 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Printer className="w-5 h-5 mr-2" />
                      Capture Document
                    </>
                  )}
                </Button>

                {isScanning && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Receiving from API...</span>
                      <span>{scanProgress}%</span>
                    </div>
                    <Progress value={scanProgress} className="h-2" />
                  </div>
                )}
              </div>
              
              <Separator />

              {/* Export Settings */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Target Destination</h2>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => {
                    setIsReadingTree(true);
                    setTimeout(() => setIsReadingTree(false), 800);
                  }}>
                    <RefreshCcw className={`w-3 h-3 mr-1 ${isReadingTree ? 'animate-spin' : ''}`} />
                    Read tree.bin
                  </Button>
                </div>
                
                <div className="space-y-4 bg-muted/30 p-3 rounded-lg border border-border">
                  <div className="space-y-2">
                    <Label htmlFor="bucket">Select Bucket (tree.bin)</Label>
                    <Select value={selectedBucket} onValueChange={setSelectedBucket}>
                      <SelectTrigger id="bucket" className="bg-white">
                        <SelectValue placeholder="Select bucket" />
                      </SelectTrigger>
                      <SelectContent>
                        {mockBuckets.map(bucket => (
                          <SelectItem key={bucket} value={bucket}>{bucket}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="location">Target Directory</Label>
                    <div className="flex space-x-2">
                      <Input 
                        id="location" 
                        value="[ENCRYPTED] \ *** \ Secure_Storage" 
                        readOnly 
                        className="bg-slate-100 text-slate-500 font-mono text-xs"
                      />
                    </div>
                  </div>
                  
                  <div className="pt-2 text-xs text-muted-foreground flex items-center space-x-1">
                    <FileText className="w-3 h-3" />
                    <span>Output: {selectedBucket}.pdf</span>
                  </div>

                  <Button 
                    variant="default" 
                    className="w-full bg-slate-800 hover:bg-slate-900 text-white mt-2"
                    onClick={handleSavePDF}
                    disabled={pages.length === 0}
                    data-testid="button-save-pdf"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Export to Shared Disk
                  </Button>
                </div>
              </div>

            </div>
          </ScrollArea>
        </aside>

        {/* Center - Document Preview */}
        <section className="flex-1 flex flex-col bg-slate-100 relative shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)]">
          {/* Toolbar */}
          <div className="flex items-center justify-between p-3 bg-white/80 backdrop-blur-md border-b border-border shadow-sm absolute top-0 left-0 right-0 z-10">
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" onClick={handleSelectAll} disabled={pages.length === 0}>
                <CheckSquare className="w-4 h-4 mr-2" />
                Select All
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDeleteSelected} disabled={pages.length === 0 || !pages.some(p => p.selected)}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected
              </Button>
              <Button variant="ghost" size="sm" disabled={pages.length === 0}>
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="icon" disabled={!activePage}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium w-12 text-center">100%</span>
              <Button variant="ghost" size="icon" disabled={!activePage}>
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Canvas */}
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
              <div className="relative group transition-all duration-300 shadow-[0_10px_40px_rgba(0,0,0,0.1)] hover:shadow-[0_15px_50px_rgba(0,0,0,0.15)] bg-white max-w-3xl w-full mx-auto"
                   style={{ aspectRatio: '3/4' }}>
                <img 
                  src={activePage.url} 
                  alt={`Page ${activePage.pageNumber}`}
                  className="w-full h-full object-contain pointer-events-none"
                />
                <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md">
                  Page {activePage.pageNumber}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* Right Sidebar - Page Thumbnails */}
        <aside className="w-64 flex flex-col border-l border-border bg-card z-10 flex-shrink-0">
          <div className="p-4 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-sm">Document Pages ({pages.length})</h2>
            <p className="text-xs text-muted-foreground">{pages.filter(p => p.selected).length} selected</p>
          </div>
          
          <ScrollArea className="flex-1 p-4">
            <div className="grid grid-cols-2 gap-4 pb-20">
              {pages.map((page) => (
                <div 
                  key={page.id}
                  className={`
                    relative group cursor-pointer rounded-md overflow-hidden border-2 transition-all
                    ${page.id === activePageId ? 'ring-2 ring-primary border-transparent' : 'border-transparent hover:border-primary/50'}
                    ${page.selected ? 'bg-primary/5' : 'bg-muted/30'}
                  `}
                  onClick={() => setActivePageId(page.id)}
                >
                  <div className="aspect-[3/4] p-1">
                    <img 
                      src={page.url} 
                      className="w-full h-full object-cover rounded-sm shadow-sm bg-white" 
                      alt={`Thumbnail ${page.pageNumber}`} 
                    />
                  </div>
                  
                  {/* Selection Checkbox */}
                  <div 
                    className={`
                      absolute top-2 left-2 w-5 h-5 rounded border bg-white/90 backdrop-blur flex items-center justify-center
                      ${page.selected ? 'border-primary bg-primary text-white' : 'border-slate-300 opacity-0 group-hover:opacity-100'}
                      transition-opacity
                    `}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelection(page.id);
                    }}
                  >
                    {page.selected && <CheckSquare className="w-3 h-3" />}
                  </div>

                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] text-center py-1 font-medium backdrop-blur-sm">
                    {page.pageNumber}
                  </div>
                </div>
              ))}
            </div>
            
            {pages.length > 0 && (
              <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-card via-card to-transparent border-t">
                <Button 
                  variant="outline" 
                  className="w-full bg-background" 
                  onClick={() => {
                    const newId = Math.random().toString(36).substring(7);
                    setPages([...pages, { id: newId, url: "/images/sample-invoice.png", selected: true, pageNumber: pages.length + 1 }]);
                    setActivePageId(newId);
                  }}
                >
                  + Add Page
                </Button>
              </div>
            )}
          </ScrollArea>
        </aside>

      </main>
    </div>
  );
}