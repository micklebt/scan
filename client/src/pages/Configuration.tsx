import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Save, Plus, Trash2, Network } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Configuration() {
  const [scanners, setScanners] = useState([
    { id: 1, name: "Sharp MX-M503N", ip: "192.168.1.234", default: true }
  ]);

  const [targetPath, setTargetPath] = useState("f:\\scan-images\\");
  const [barcodePrefix, setBarcodePrefix] = useState("B");

  const handleSave = () => {
    toast({
      title: "Settings Saved",
      description: "Configuration has been updated successfully.",
    });
  };

  return (
    <div className="flex-1 p-8 bg-slate-50 h-screen overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configuration Panel</h1>
          <p className="text-muted-foreground mt-2">Manage scanner network connections and application defaults.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Network className="w-5 h-5" />
              <span>Network Scanners</span>
            </CardTitle>
            <CardDescription>Configure the IP addresses for scanners on your local network.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              {scanners.map((scanner, index) => (
                <div key={scanner.id} className="flex items-center gap-4 p-4 border rounded-lg bg-card">
                  <div className="grid grid-cols-2 gap-4 flex-1">
                    <div className="space-y-2">
                      <Label>Scanner Name</Label>
                      <Input value={scanner.name} readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label>IP Address</Label>
                      <Input value={scanner.ip} readOnly />
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="mt-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full border-dashed">
              <Plus className="w-4 h-4 mr-2" />
              Add Scanner
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Defaults</CardTitle>
            <CardDescription>Set up default paths and naming conventions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Default Save Path</Label>
              <div className="flex space-x-2">
                <Input value={targetPath} onChange={(e) => setTargetPath(e.target.value)} />
                <Button variant="secondary">Browse...</Button>
              </div>
              <p className="text-xs text-muted-foreground">The local directory where PDFs will be saved.</p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Barcode Naming Prefix (3of9)</Label>
              <Input value={barcodePrefix} onChange={(e) => setBarcodePrefix(e.target.value)} />
              <p className="text-xs text-muted-foreground">If a barcode is detected, this prefix identifies it as a valid document name.</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button size="lg" onClick={handleSave} className="px-8">
            <Save className="w-4 h-4 mr-2" />
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  );
}