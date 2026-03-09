import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FileScan, Settings, FolderKanban } from "lucide-react";
import NotFound from "@/pages/not-found";
import CaptureStation from "@/pages/CaptureStation";
import Configuration from "@/pages/Configuration";
import OutputManager from "@/pages/OutputManager";

function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  const navItems = [
    { path: "/", label: "FileScan", icon: FileScan },
    { path: "/output", label: "Output Manager", icon: FolderKanban },
    { path: "/config", label: "Configuration", icon: Settings },
  ];

  return (
    <div className="flex h-screen w-full bg-slate-100 overflow-hidden">
      {/* App Sidebar */}
      <div className="w-16 flex flex-col bg-slate-900 border-r border-slate-800 py-4 items-center space-y-4 z-50">
        <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center mb-4 shadow-lg">
          <FileScan className="w-6 h-6 text-white" />
        </div>
        
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path;
          return (
            <button
              key={item.path}
              onClick={() => setLocation(item.path)}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                isActive 
                  ? "bg-primary text-white shadow-md" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
              title={item.label}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  );
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={CaptureStation}/>
        <Route path="/config" component={Configuration}/>
        <Route path="/output" component={OutputManager}/>
        {/* Fallback to 404 */}
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;