import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Save, Plus, Trash2, Network } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";

export default function Configuration() {
  const queryClient = useQueryClient();

  const { data: scanners = [], isLoading: scannersLoading } = useQuery({
    queryKey: ["/api/scanners"],
    queryFn: () => apiRequest("GET", "/api/scanners"),
  });

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/settings"],
    queryFn: () => apiRequest("GET", "/api/settings"),
  });

  const [newName, setNewName] = useState("");
  const [newIp, setNewIp] = useState("");

  const addScannerMutation = useMutation({
    mutationFn: (data: { name: string; ip: string; isDefault: boolean }) =>
      apiRequest("POST", "/api/scanners", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scanners"] });
      setNewName("");
      setNewIp("");
      toast({ title: "Scanner Added" });
    },
  });

  const deleteScannerMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/scanners/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scanners"] });
      toast({ title: "Scanner Removed" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/scanners/${id}`, { isDefault: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scanners"] });
      toast({ title: "Default Scanner Updated" });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings Saved", description: "Configuration has been updated successfully." });
    },
  });

  const [savePath, setSavePath] = useState("");
  const [barcodePrefix, setBarcodePrefix] = useState("");

  const isSettingsReady = settings && !settingsLoading;
  if (isSettingsReady && !savePath && !barcodePrefix) {
    setSavePath(settings.savePath);
    setBarcodePrefix(settings.barcodePrefix);
  }

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
              {scanners.map((scanner: any) => (
                <div key={scanner.id} className="flex items-center gap-4 p-4 border rounded-lg bg-card">
                  <div className="grid grid-cols-3 gap-4 flex-1">
                    <div className="space-y-2">
                      <Label>Scanner Name</Label>
                      <Input value={scanner.name} readOnly data-testid={`input-scanner-name-${scanner.id}`} />
                    </div>
                    <div className="space-y-2">
                      <Label>IP Address</Label>
                      <Input value={scanner.ip} readOnly data-testid={`input-scanner-ip-${scanner.id}`} />
                    </div>
                    <div className="space-y-2 flex flex-col justify-end">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={scanner.isDefault}
                          onCheckedChange={() => setDefaultMutation.mutate(scanner.id)}
                        />
                        <Label className="text-xs">Default</Label>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-4 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteScannerMutation.mutate(scanner.id)}
                    data-testid={`button-delete-scanner-${scanner.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="p-4 border border-dashed rounded-lg space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Add New Scanner</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Sharp MX-M503N" data-testid="input-new-scanner-name" />
                </div>
                <div className="space-y-2">
                  <Label>IP Address</Label>
                  <Input value={newIp} onChange={(e) => setNewIp(e.target.value)} placeholder="192.168.1.234" data-testid="input-new-scanner-ip" />
                </div>
              </div>
              <Button
                onClick={() => {
                  if (!newName || !newIp) {
                    toast({ title: "Missing fields", description: "Please enter both a name and IP address.", variant: "destructive" });
                    return;
                  }
                  addScannerMutation.mutate({ name: newName, ip: newIp, isDefault: scanners.length === 0 });
                }}
                disabled={addScannerMutation.isPending}
                data-testid="button-add-scanner"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Scanner
              </Button>
            </div>
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
              <Input value={savePath} onChange={(e) => setSavePath(e.target.value)} data-testid="input-save-path" />
              <p className="text-xs text-muted-foreground">The local directory where PDFs will be saved.</p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Barcode Naming Prefix (3of9)</Label>
              <Input value={barcodePrefix} onChange={(e) => setBarcodePrefix(e.target.value)} data-testid="input-barcode-prefix" />
              <p className="text-xs text-muted-foreground">If a barcode is detected, this prefix identifies it as a valid document name.</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={() => updateSettingsMutation.mutate({ savePath, barcodePrefix })}
            className="px-8"
            disabled={updateSettingsMutation.isPending}
            data-testid="button-save-settings"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  );
}
