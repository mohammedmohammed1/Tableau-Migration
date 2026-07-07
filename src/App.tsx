import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Upload,
  FileText,
  Database,
  ArrowRight,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  FileCode,
  Download,
  Settings,
  Terminal,
  Grid,
  Check,
  Shield,
  HelpCircle,
  Search,
  Layers,
  ChevronRight,
  Cpu,
  BarChart2,
  Table,
  Zap,
  BookOpen,
  Info,
  Calendar,
  User,
  GitBranch,
  Play
} from "lucide-react";
import { SAMPLE_PROJECTS, MOCK_AUDIT_LOGS } from "./sampleData";
import { MigrationProject, TableauDatasource, CalculatedField } from "./types";

export default function App() {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [userEmail, setUserEmail] = useState<string>("mohamedyasin9168@gmail.com");
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Core Projects & Navigation State
  const [projects, setProjects] = useState<MigrationProject[]>(() => {
    // Inject sample calculations into projects dynamically
    return SAMPLE_PROJECTS.map((p) => {
      if (p.metadata) {
        p.calculatedFields = p.metadata.datasources.flatMap((ds) => ds.calculatedFields);
      }
      return p;
    });
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string>("proj-superstore");
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Upload state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Playground calculation state
  const [customTableauFormula, setCustomTableauFormula] = useState<string>(
    "{ FIXED [Category], [Region] : SUM([Sales]) }"
  );
  const [customFormulaName, setCustomFormulaName] = useState<string>("Regional Category Sales");
  const [customContext, setCustomContext] = useState<string>("Sales Fact Table");
  const [isTranslatingPlayground, setIsTranslatingPlayground] = useState<boolean>(false);
  const [playgroundResult, setPlaygroundResult] = useState<any>({
    dax: "Regional Category Sales = \nCALCULATE(\n    SUM(Fact_Orders[Sales]),\n    ALLEXCEPT(Fact_Orders, Dim_Products[Category], Dim_Location[Region])\n)",
    powerQueryM: "// Best practice: Implement via DAX Measure to preserve interactive filtering context.",
    explanation: "Translated standard FIXED multi-dimension LOD calculation using CALCULATE with ALLEXCEPT. This ignores all page filters except Category and Region, matching the core Tableau behavior.",
    complexity: "High",
    daxType: "Measure",
    warnings: ["Will not respond to year or customer-level slicers unless they are explicitly added as INCLUDE constraints."]
  });

  // Selected calculation for side-by-side viewer
  const [selectedCalcId, setSelectedCalcId] = useState<string>("");

  // Validation Tolerance Slicers
  const [tolerance, setTolerance] = useState<number>(0.0);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  // Deployment variables
  const [isDeploying, setIsDeploying] = useState<boolean>(false);
  const [deploySuccess, setDeploySuccess] = useState<boolean>(false);

  // Search Filter
  const [schemaSearch, setSchemaSearch] = useState<string>("");

  // Quick setup of first calc id on selected project change
  const activeProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  useEffect(() => {
    if (activeProject && activeProject.calculatedFields.length > 0) {
      setSelectedCalcId(activeProject.calculatedFields[0].id);
    } else {
      setSelectedCalcId("");
    }
  }, [selectedProjectId]);

  // Handle Tableau TWB Upload
  const handleFileUpload = async (xmlText: string, fileName: string) => {
    setIsAnalyzing(true);
    setUploadError(null);
    try {
      const response = await fetch("/api/analyze-workbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xmlContent: xmlText, fileName }),
      });
      const data = await response.json();

      if (data.success) {
        const newProj: MigrationProject = {
          id: `proj-${Date.now()}`,
          name: data.metadata.name,
          status: "Extracted",
          progress: 60,
          tableauFileName: fileName,
          createdDate: new Date().toISOString().split("T")[0],
          metadata: data.metadata,
          dataModel: data.dataModelAnalysis,
          calculatedFields: data.metadata.datasources.flatMap((ds: any) => ds.calculatedFields),
          validation: {
            rowCountMatch: true,
            columnCountMatch: true,
            totalsMatch: false,
            kpiMatch: false,
            discrepancyCount: 2,
            results: [
              { metricName: "Raw Table Rows", tableauValue: 12050, powerBiValue: 12050, variance: 0, status: "Pass" },
              { metricName: "Extract Sum Total", tableauValue: 4851000, powerBiValue: 4850900, variance: -100, status: "Warning" },
            ]
          },
          logs: [
            { timestamp: new Date().toLocaleTimeString(), level: "info", message: `Custom project '${data.metadata.name}' initialized.` },
            { timestamp: new Date().toLocaleTimeString(), level: "success", message: "Parsed local .twb XML file successfully." },
            { timestamp: new Date().toLocaleTimeString(), level: "info", message: `Found ${data.metadata.datasources.length} datasources, ${data.metadata.worksheets.length} sheets.` },
          ],
        };

        setProjects((prev) => [newProj, ...prev]);
        setSelectedProjectId(newProj.id);
        setActiveTab("workbook");
      } else {
        setUploadError(data.error || "Failed to analyze workbook.");
      }
    } catch (err: any) {
      setUploadError(err.message || "Error reading file.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith(".twb") || file.name.endsWith(".xml")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            handleFileUpload(event.target.result as string, file.name);
          }
        };
        reader.readAsText(file);
      } else {
        setUploadError("Only standard .twb (Tableau Workbook XML) files are supported directly by the parser.");
      }
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          handleFileUpload(event.target.result as string, file.name);
        }
      };
      reader.readAsText(file);
    }
  };

  // Convert custom playground formula
  const handlePlaygroundConvert = async () => {
    setIsTranslatingPlayground(true);
    try {
      const response = await fetch("/api/convert-formula", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formula: customTableauFormula,
          formulaName: customFormulaName,
          context: customContext,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setPlaygroundResult(data.translation);
      } else {
        setPlaygroundResult({
          dax: "Error = // Failed translation",
          powerQueryM: "",
          explanation: "Gemini calculation failed. Ensure internet connection or key status.",
          complexity: "Low",
          daxType: "Measure",
          warnings: ["Check error log."]
        });
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsTranslatingPlayground(false);
    }
  };

  // Convert an extracted formula inline
  const handleInlineConvert = async (calc: CalculatedField) => {
    const updatedProjects = [...projects];
    const projectIndex = updatedProjects.findIndex((p) => p.id === selectedProjectId);
    if (projectIndex === -1) return;

    const calcIndex = updatedProjects[projectIndex].calculatedFields.findIndex((c) => c.id === calc.id);
    if (calcIndex === -1) return;

    // Set converting log
    updatedProjects[projectIndex].logs.unshift({
      timestamp: new Date().toLocaleTimeString(),
      level: "info",
      message: `Translating calculation '${calc.name}' via Gemini AI...`
    });
    setProjects(updatedProjects);

    try {
      const response = await fetch("/api/convert-formula", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formula: calc.formula,
          formulaName: calc.name,
          context: activeProject.dataModel?.schemaType || "Star Schema",
        }),
      });
      const data = await response.json();

      const nextProjects = [...projects];
      const nextProj = nextProjects[projectIndex];
      const nextCalc = nextProj.calculatedFields[calcIndex];

      if (data.success) {
        nextCalc.convertedDax = data.translation.dax;
        nextCalc.convertedM = data.translation.powerQueryM;
        nextCalc.explanation = data.translation.explanation;
        nextCalc.complexity = data.translation.complexity;
        nextCalc.daxType = data.translation.daxType;
        nextCalc.warnings = data.translation.warnings;
        nextCalc.status = "Verified";

        nextProj.logs.unshift({
          timestamp: new Date().toLocaleTimeString(),
          level: "success",
          message: `Successfully translated '${calc.name}' to optimized DAX.`
        });
      } else {
        nextCalc.status = "Error";
      }
      setProjects(nextProjects);
    } catch (err) {
      console.error(err);
    }
  };

  // Build BIM File Download
  const handleDownloadBim = async () => {
    try {
      const response = await fetch("/api/generate-bim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workbookName: activeProject.name,
          tables: activeProject.metadata?.datasources.flatMap((ds) =>
            ds.tables.map((t) => ({
              name: t.name,
              columns: ds.columns
            }))
          ),
          relationships: activeProject.dataModel?.relationships,
          measures: activeProject.calculatedFields.map((c) => ({
            name: c.name,
            tableName: activeProject.dataModel?.factTables[0] || "Fact_Orders",
            expression: c.convertedDax || `${c.name} = SUM(1)`,
          }))
        }),
      });
      const data = await response.json();

      if (data.success) {
        const blob = new Blob([data.bimContent], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Failed to generate BIM", err);
    }
  };

  // Quick simulation of Validation
  const runReconciliation = () => {
    setIsValidating(true);
    setTimeout(() => {
      setIsValidating(false);
      const updatedProjects = [...projects];
      const index = updatedProjects.findIndex((p) => p.id === selectedProjectId);
      if (index !== -1) {
        updatedProjects[index].status = "Validated";
        updatedProjects[index].progress = 100;
        if (updatedProjects[index].validation) {
          updatedProjects[index].validation!.results.forEach((r) => {
            r.status = "Pass";
            r.variance = 0;
            r.powerBiValue = r.tableauValue;
          });
          updatedProjects[index].validation!.discrepancyCount = 0;
          updatedProjects[index].validation!.totalsMatch = true;
          updatedProjects[index].validation!.kpiMatch = true;
        }
        updatedProjects[index].logs.unshift({
          timestamp: new Date().toLocaleTimeString(),
          level: "success",
          message: "Automated validation complete: Row counts and metric aggregate totals match source Tableau reports perfectly."
        });
        setProjects(updatedProjects);
      }
    }, 1500);
  };

  // Mock Deploy
  const deploySemanticModel = () => {
    setIsDeploying(true);
    setTimeout(() => {
      setIsDeploying(false);
      setDeploySuccess(true);
      const updatedProjects = [...projects];
      const index = updatedProjects.findIndex((p) => p.id === selectedProjectId);
      if (index !== -1) {
        updatedProjects[index].status = "Completed";
        updatedProjects[index].logs.unshift({
          timestamp: new Date().toLocaleTimeString(),
          level: "success",
          message: "Published migrated semantic model and dashboards directly to Power BI Cloud Workspace."
        });
      }
      setProjects(updatedProjects);
    }, 2000);
  };

  const selectedCalc = activeProject.calculatedFields.find((c) => c.id === selectedCalcId);

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200 font-sans flex flex-col antialiased">
      {/* Top Enterprise Banner */}
      <header className="border-b border-gray-800 bg-[#161b22] px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-yellow-500 to-amber-600 p-2 rounded-lg shadow-inner text-black">
            <Layers className="h-6 w-6" id="app_logo" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
              Enterprise Tableau to Power BI Migration Platform
              <span className="text-[10px] uppercase font-mono bg-amber-500/10 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded">
                AI-Powered
              </span>
            </h1>
            <p className="text-xs text-gray-400">Automated Metadata Extraction, Schema Mapping & DAX Transpilation Suite</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs bg-gray-800/80 border border-gray-700 rounded-full px-3 py-1.5">
            <User className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-gray-300 font-mono text-[11px]">{userEmail}</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <button
            onClick={() => {
              // Reset
              setIsAuthenticated(true);
            }}
            className="text-xs hover:text-white text-gray-400 flex items-center gap-1.5 transition"
          >
            <Shield className="h-3.5 w-3.5" />
            Azure AD Secure
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r border-gray-800 bg-[#161b22] p-4 flex flex-col gap-5 overflow-y-auto shrink-0">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-amber-500" />
                Migration Projects
              </h3>
            </div>
            <div className="flex flex-col gap-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProjectId(p.id)}
                  className={`w-full text-left p-3 rounded-lg border text-xs transition duration-150 flex flex-col gap-2 relative overflow-hidden ${
                    selectedProjectId === p.id
                      ? "bg-amber-500/10 border-amber-500/40 text-white"
                      : "bg-[#0d1117]/60 border-gray-800 hover:border-gray-700 hover:bg-gray-800/30 text-gray-300"
                  }`}
                >
                  {selectedProjectId === p.id && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold truncate">{p.name}</span>
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded font-mono border ${
                        p.status === "Completed"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : p.status === "Validated"
                          ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                          : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-gray-500">
                    <span className="font-mono">{p.tableauFileName}</span>
                    <span>Progress: {p.progress}%</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-gray-800 rounded-full h-1 mt-1 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        p.status === "Completed" ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-800 pt-4 mt-auto">
            <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider mb-2 flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5 text-amber-500" />
              Upload Source
            </h3>
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition ${
                isDragging
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-gray-800 hover:border-gray-700 bg-[#0d1117]"
              }`}
            >
              <input
                type="file"
                accept=".twb,.xml"
                onChange={onFileSelect}
                className="hidden"
                id="file-upload-input"
              />
              <label htmlFor="file-upload-input" className="cursor-pointer">
                {isAnalyzing ? (
                  <div className="flex flex-col items-center gap-2">
                    <RefreshCw className="h-6 w-6 text-amber-500 animate-spin" />
                    <span className="text-xs text-gray-300">Parsing XML Schema...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-6 w-6 text-gray-500 mx-auto" />
                    <span className="text-xs font-semibold text-gray-300 block">Drag & drop Tableau file</span>
                    <span className="text-[10px] text-gray-500 block">Supports .twb (XML) directly</span>
                    <span className="mt-1.5 inline-block text-[10px] bg-gray-800 text-amber-500 border border-gray-700 px-2.5 py-1 rounded hover:bg-gray-700 transition">
                      Browse Files
                    </span>
                  </div>
                )}
              </label>
            </div>
            {uploadError && (
              <p className="text-[10px] text-rose-400 mt-2 bg-rose-500/10 border border-rose-500/20 p-2 rounded">
                {uploadError}
              </p>
            )}
          </div>
        </aside>

        {/* Content Panel */}
        <main className="flex-1 bg-[#0d1117] flex flex-col overflow-hidden">
          {/* Tabs Navigation */}
          <nav className="flex items-center gap-1 bg-[#161b22] px-6 border-b border-gray-800 overflow-x-auto">
            {[
              { id: "dashboard", label: "Control Cockpit", icon: BarChart2 },
              { id: "workbook", label: "Workbook Metadata", icon: FileText },
              { id: "model", label: "Semantic Model", icon: GitBranch },
              { id: "converter", label: "AI DAX Transpiler", icon: FileCode },
              { id: "visual", label: "Visual Replicator", icon: Grid },
              { id: "validation", label: "Validation Sandbox", icon: CheckCircle },
              { id: "export", label: "Deployment Hub", icon: Download },
              { id: "blueprints", label: "Architecture Blueprints", icon: BookOpen },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`py-3.5 px-4 text-xs font-medium border-b-2 transition flex items-center gap-2 shrink-0 ${
                    activeTab === t.id
                      ? "border-amber-500 text-white bg-amber-500/5"
                      : "border-transparent text-gray-400 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* Active Tab View */}
          <div className="flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                {/* Tab 1: Control Cockpit / Dashboard Overview */}
                {activeTab === "dashboard" && (
                  <div className="space-y-6">
                    {/* Upper Metrics Row */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                        <div className="bg-amber-500/10 text-amber-500 p-3 rounded-lg">
                          <Layers className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase font-mono">Active Projects</p>
                          <h4 className="text-2xl font-bold text-white mt-1">{projects.length}</h4>
                        </div>
                      </div>

                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                        <div className="bg-emerald-500/10 text-emerald-400 p-3 rounded-lg">
                          <CheckCircle className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase font-mono">DAX Conversion Rate</p>
                          <h4 className="text-2xl font-bold text-white mt-1">100.0%</h4>
                        </div>
                      </div>

                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                        <div className="bg-blue-500/10 text-blue-400 p-3 rounded-lg">
                          <RefreshCw className="h-6 w-6 animate-pulse" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase font-mono">Validation Quality</p>
                          <h4 className="text-2xl font-bold text-white mt-1">
                            {activeProject.validation?.discrepancyCount === 0 ? "100.0% Perfect" : "99.8% Perfect"}
                          </h4>
                        </div>
                      </div>

                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                        <div className="bg-rose-500/10 text-rose-400 p-3 rounded-lg">
                          <AlertTriangle className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase font-mono">Unsupported Features</p>
                          <h4 className="text-2xl font-bold text-white mt-1">
                            {activeProject.metadata?.unsupportedFeatures.length || 0} Blockers
                          </h4>
                        </div>
                      </div>
                    </div>

                    {/* Active Project Highlight */}
                    <div className="bg-gradient-to-r from-amber-500/10 via-[#161b22] to-[#161b22] border border-amber-500/20 rounded-xl p-6">
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-white">{activeProject.name}</h2>
                            <span className="text-xs bg-amber-500/20 text-amber-500 font-mono border border-amber-500/30 px-2 py-0.5 rounded">
                              Current Focus
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            Targeting semantic model conversion from <span className="font-semibold text-gray-200">{activeProject.tableauFileName}</span> to clean Power BI Direct Lake structures.
                          </p>
                        </div>
                        <button
                          onClick={() => setActiveTab("converter")}
                          className="bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs py-2.5 px-4 rounded-lg flex items-center gap-2 transition"
                        >
                          <FileCode className="h-4 w-4" />
                          Launch Transpiler
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 border-t border-gray-800/60 pt-6">
                        <div>
                          <h5 className="text-xs text-gray-500 uppercase font-mono">Workbook Properties</h5>
                          <ul className="mt-3 space-y-2 text-xs">
                            <li className="flex justify-between">
                              <span className="text-gray-400">Author:</span>
                              <span className="text-white font-medium">{activeProject.metadata?.author}</span>
                            </li>
                            <li className="flex justify-between">
                              <span className="text-gray-400">Tableau Version:</span>
                              <span className="text-white font-mono">{activeProject.metadata?.version}</span>
                            </li>
                            <li className="flex justify-between">
                              <span className="text-gray-400">Last Published:</span>
                              <span className="text-white font-mono">{activeProject.metadata?.publishedDate}</span>
                            </li>
                          </ul>
                        </div>

                        <div>
                          <h5 className="text-xs text-gray-500 uppercase font-mono">Model Complexity</h5>
                          <ul className="mt-3 space-y-2 text-xs">
                            <li className="flex justify-between">
                              <span className="text-gray-400">Schema Strategy:</span>
                              <span className="text-amber-500 font-medium">{activeProject.dataModel?.schemaType}</span>
                            </li>
                            <li className="flex justify-between">
                              <span className="text-gray-400">Total Dimensions:</span>
                              <span className="text-white font-mono">{activeProject.dataModel?.dimensionTables.length}</span>
                            </li>
                            <li className="flex justify-between">
                              <span className="text-gray-400">Total Calculated Fields:</span>
                              <span className="text-white font-mono">{activeProject.calculatedFields.length}</span>
                            </li>
                          </ul>
                        </div>

                        <div>
                          <h5 className="text-xs text-gray-500 uppercase font-mono">Validation Metrics</h5>
                          <ul className="mt-3 space-y-2 text-xs">
                            <li className="flex justify-between">
                              <span className="text-gray-400">Row Count Check:</span>
                              <span className="text-emerald-400 font-medium flex items-center gap-1">
                                <CheckCircle className="h-3.5 w-3.5" /> Matches
                              </span>
                            </li>
                            <li className="flex justify-between">
                              <span className="text-gray-400">Aggregate Variance:</span>
                              <span className="text-emerald-400 font-medium">0.00%</span>
                            </li>
                            <li className="flex justify-between">
                              <span className="text-gray-400">Calculations verified:</span>
                              <span className="text-white font-mono">
                                {activeProject.calculatedFields.filter((c) => c.status === "Verified").length} /{" "}
                                {activeProject.calculatedFields.length}
                              </span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Timeline & Audit Logs */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5 lg:col-span-2">
                        <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider mb-4 flex items-center gap-2">
                          <Terminal className="h-4 w-4 text-amber-500" />
                          Live Transpiler Log Feed
                        </h3>
                        <div className="font-mono text-xs bg-[#0d1117] border border-gray-800 rounded-lg p-4 space-y-3 max-h-72 overflow-y-auto">
                          {activeProject.logs.map((log, i) => (
                            <div key={i} className="flex items-start gap-2.5">
                              <span className="text-gray-500">[{log.timestamp}]</span>
                              <span
                                className={`uppercase text-[10px] px-1.5 rounded font-bold shrink-0 border ${
                                  log.level === "success"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : log.level === "warn"
                                    ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                    : log.level === "error"
                                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                    : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                }`}
                              >
                                {log.level}
                              </span>
                              <span className="text-gray-300">{log.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5">
                        <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider mb-3 flex items-center gap-2">
                          <Info className="h-4 w-4 text-amber-500" />
                          Critical Recommendations
                        </h3>
                        <div className="space-y-3.5">
                          <div className="flex gap-2.5 items-start">
                            <span className="p-1 rounded bg-amber-500/10 text-amber-500 mt-0.5">
                              <Zap className="h-3.5 w-3.5" />
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-white">Direct Lake Model Selection</p>
                              <p className="text-[11px] text-gray-400 mt-1">
                                For enterprise Oracle and Postgres sources, compile to direct lake schema over MS Fabric Delta Parquet.
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-2.5 items-start">
                            <span className="p-1 rounded bg-blue-500/10 text-blue-500 mt-0.5">
                              <GitBranch className="h-3.5 w-3.5" />
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-white">Optimize FIXED Calculations</p>
                              <p className="text-[11px] text-gray-400 mt-1">
                                Translate FIXED expressions as calculated columns in Power Query instead of complex DAX filters when indexing large datasets.
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-2.5 items-start">
                            <span className="p-1 rounded bg-emerald-500/10 text-emerald-500 mt-0.5">
                              <CheckCircle className="h-3.5 w-3.5" />
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-white">Date Dimension Strategy</p>
                              <p className="text-[11px] text-gray-400 mt-1">
                                Replace Tableau's built-in date hierarchy formulas with a marked custom CALENDAR() table in the Power BI Semantic Model.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Workbook Metadata / XML Parser Results */}
                {activeTab === "workbook" && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-white">Tableau Document API Extraction</h2>
                        <p className="text-xs text-gray-400 mt-1">Direct breakdown of workbook properties, datasources, and worksheets parsed from workbook XML schema.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Left: Connections and Metadata List */}
                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5 lg:col-span-2 space-y-6">
                        <div>
                          <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider mb-3 flex items-center gap-1.5">
                            <Database className="h-3.5 w-3.5 text-amber-500" />
                            Active Connection Profiles
                          </h3>
                          <div className="space-y-3">
                            {activeProject.metadata?.datasources.map((ds, idx) => (
                              <div key={idx} className="bg-[#0d1117] border border-gray-800 rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
                                <div>
                                  <span className="text-gray-500 block mb-1 uppercase text-[10px]">Data Source ID</span>
                                  <span className="text-amber-500 font-semibold">{ds.name}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500 block mb-1 uppercase text-[10px]">Database Type</span>
                                  <span className="text-white flex items-center gap-1">
                                    <Layers className="h-3 w-3 text-blue-400" /> {ds.connection.type.toUpperCase()}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500 block mb-1 uppercase text-[10px]">Server Host</span>
                                  <span className="text-white truncate block">{ds.connection.server}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500 block mb-1 uppercase text-[10px]">Logical Catalog</span>
                                  <span className="text-white block">{ds.connection.database}.{ds.connection.schema}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-3">
                            <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider flex items-center gap-1.5">
                              <Table className="h-3.5 w-3.5 text-amber-500" />
                              Workbook Schema & Physical Column Inventory
                            </h3>
                            <div className="relative">
                              <Search className="h-3.5 w-3.5 text-gray-500 absolute left-2.5 top-2.5" />
                              <input
                                type="text"
                                placeholder="Search columns..."
                                value={schemaSearch}
                                onChange={(e) => setSchemaSearch(e.target.value)}
                                className="bg-[#0d1117] border border-gray-800 rounded px-2.5 py-1 text-xs pl-8 text-white focus:outline-none focus:border-amber-500/50"
                              />
                            </div>
                          </div>

                          <div className="border border-gray-800 rounded-lg overflow-hidden text-xs max-h-96 overflow-y-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-[#0d1117] border-b border-gray-800 text-gray-400 font-mono text-[10px] uppercase">
                                  <th className="p-3">Source Column Name</th>
                                  <th className="p-3">XML Node ID</th>
                                  <th className="p-3">Datatype</th>
                                  <th className="p-3">Semantic Role</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-800/60 text-gray-300 font-mono">
                                {activeProject.metadata?.datasources.flatMap((ds) =>
                                  ds.columns
                                    .filter((col) => col.name.toLowerCase().includes(schemaSearch.toLowerCase()) || col.id.toLowerCase().includes(schemaSearch.toLowerCase()))
                                    .map((col, cIdx) => (
                                      <tr key={cIdx} className="hover:bg-gray-800/20">
                                        <td className="p-3 text-white font-sans font-medium">{col.name}</td>
                                        <td className="p-3 text-gray-500">{col.id}</td>
                                        <td className="p-3 text-amber-500">{col.datatype}</td>
                                        <td className="p-3">
                                          <span
                                            className={`text-[10px] px-2 py-0.5 rounded font-sans ${
                                              col.role === "measure"
                                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                                : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                            }`}
                                          >
                                            {col.role}
                                          </span>
                                        </td>
                                      </tr>
                                    ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      {/* Right: Layout list / Worksheet mappings */}
                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5 space-y-6">
                        <div>
                          <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider mb-3 flex items-center gap-1.5">
                            <Grid className="h-3.5 w-3.5 text-amber-500" />
                            Worksheet Layout Tree
                          </h3>
                          <div className="space-y-2">
                            {activeProject.metadata?.worksheets.map((sheet, idx) => (
                              <div key={idx} className="bg-[#0d1117] border border-gray-800 p-3 rounded-lg flex items-center justify-between text-xs">
                                <div>
                                  <p className="font-semibold text-white">{sheet.name}</p>
                                  <p className="text-gray-500 text-[10px] font-mono mt-0.5">Visual: {sheet.visualType}</p>
                                </div>
                                <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded">
                                  {sheet.filters.length} Slicers
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider mb-3 flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5 text-amber-500" />
                            Parameters & Globals
                          </h3>
                          <div className="space-y-2 text-xs font-mono">
                            {activeProject.metadata?.parameters.map((param, idx) => (
                              <div key={idx} className="bg-[#0d1117] border border-gray-800 p-2.5 rounded-lg flex justify-between items-center">
                                <span className="text-white font-sans">{param.name}</span>
                                <span className="text-amber-500 text-[11px]">{param.datatype}</span>
                              </div>
                            ))}
                            {activeProject.metadata?.parameters.length === 0 && (
                              <p className="text-gray-500 text-[11px] italic">No custom user parameters detected in workbook.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 3: Star/Snowflake Schema and Semantic Model relationships */}
                {activeTab === "model" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Power BI Semantic Model Mapping</h2>
                      <p className="text-xs text-gray-400 mt-1">
                        Tableau's flat/joined datasource mapping translated automatically into an optimized Star Schema modeling pattern.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Left: Star Schema Visual Diagram */}
                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5 lg:col-span-2 flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5 text-amber-500" />
                            Target Star Schema Entity Graph
                          </h3>
                          <span className="text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full">
                            Structure: {activeProject.dataModel?.schemaType}
                          </span>
                        </div>

                        {/* Beautiful Star Schema SVG Diagram */}
                        <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-6 min-h-[350px] flex items-center justify-center relative overflow-hidden">
                          {/* Symmetrical Star Schema layout */}
                          <svg className="w-full h-full max-w-xl max-h-[300px]" viewBox="0 0 500 300">
                            {/* Lines from dimensions to center Fact */}
                            <line x1="80" y1="50" x2="250" y2="150" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 4" />
                            <line x1="420" y1="50" x2="250" y2="150" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 4" />
                            <line x1="80" y1="250" x2="250" y2="150" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 4" />
                            <line x1="420" y1="250" x2="250" y2="150" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 4" />

                            {/* Center Fact Table */}
                            <g transform="translate(190, 110)">
                              <rect width="120" height="80" rx="6" fill="#1e1b4b" stroke="#6366f1" strokeWidth="2" />
                              <text x="60" y="30" fill="#fff" fontSize="12" fontWeight="bold" textAnchor="middle">
                                {activeProject.dataModel?.factTables[0] || "Fact_Sales"}
                              </text>
                              <text x="60" y="52" fill="#818cf8" fontSize="10" textAnchor="middle">
                                Fact / Ledger
                              </text>
                              <text x="60" y="68" fill="#475569" fontSize="9" textAnchor="middle">
                                Cardinality: Many (*)
                              </text>
                            </g>

                            {/* Dimension 1: Top Left */}
                            <g transform="translate(20, 20)">
                              <rect width="120" height="60" rx="6" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.5" />
                              <text x="60" y="26" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">
                                {activeProject.dataModel?.dimensionTables[0] || "Dim_Customer"}
                              </text>
                              <text x="60" y="44" fill="#94a3b8" fontSize="9" textAnchor="middle">
                                1 : Many (Active)
                              </text>
                            </g>

                            {/* Dimension 2: Top Right */}
                            <g transform="translate(360, 20)">
                              <rect width="120" height="60" rx="6" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.5" />
                              <text x="60" y="26" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">
                                {activeProject.dataModel?.dimensionTables[1] || "Dim_Product"}
                              </text>
                              <text x="60" y="44" fill="#94a3b8" fontSize="9" textAnchor="middle">
                                1 : Many (Active)
                              </text>
                            </g>

                            {/* Dimension 3: Bottom Left */}
                            <g transform="translate(20, 220)">
                              <rect width="120" height="60" rx="6" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.5" />
                              <text x="60" y="26" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">
                                {activeProject.dataModel?.dimensionTables[2] || "Dim_Location"}
                              </text>
                              <text x="60" y="44" fill="#94a3b8" fontSize="9" textAnchor="middle">
                                1 : Many (Active)
                              </text>
                            </g>

                            {/* Dimension 4: Bottom Right */}
                            <g transform="translate(360, 220)">
                              <rect width="120" height="60" rx="6" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.5" />
                              <text x="60" y="26" fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">
                                {activeProject.dataModel?.dimensionTables[3] || "Dim_Calendar"}
                              </text>
                              <text x="60" y="44" fill="#94a3b8" fontSize="9" textAnchor="middle">
                                1 : Many (Active)
                              </text>
                            </g>
                          </svg>

                          <div className="absolute bottom-3 left-3 flex gap-4 text-[10px] font-mono text-gray-400">
                            <span className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> Dimension
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-[#6366f1]" /> Central Fact
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Relationships Table List */}
                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5 space-y-4">
                        <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider flex items-center gap-1.5">
                          <GitBranch className="h-3.5 w-3.5 text-amber-500" />
                          Foreign Key Join Keys
                        </h3>
                        <div className="space-y-3 max-h-[380px] overflow-y-auto">
                          {activeProject.dataModel?.relationships.map((rel, idx) => (
                            <div key={idx} className="bg-[#0d1117] border border-gray-800 p-3.5 rounded-lg space-y-2 text-xs font-mono">
                              <div className="flex justify-between items-center">
                                <span className="text-white font-semibold font-sans">{rel.fromTable}</span>
                                <span className="text-gray-500">&rarr;</span>
                                <span className="text-white font-semibold font-sans">{rel.toTable}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-[10px] pt-1 border-t border-gray-800 text-gray-400">
                                <div>
                                  <span className="block text-[8px] uppercase text-gray-500">Source Primary Key</span>
                                  <span>{rel.fromColumn}</span>
                                </div>
                                <div>
                                  <span className="block text-[8px] uppercase text-gray-500">Cardinality</span>
                                  <span className="text-amber-500">{rel.cardinality}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 4: AI DAX Formula Transpiler */}
                {activeTab === "converter" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-lg font-semibold text-white">AI Calculation and LOD Transpiler Playground</h2>
                      <p className="text-xs text-gray-400 mt-1">
                        Translates complex Tableau formulas, aggregations, Window table calcs, and Level of Detail (LOD) FIXED expressions to standard dax.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Left side: Extracted calculations picker */}
                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5 lg:col-span-4 space-y-4">
                        <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider flex items-center gap-1.5">
                          <Terminal className="h-3.5 w-3.5 text-amber-500" />
                          Parsed Calculations ({activeProject.calculatedFields.length})
                        </h3>
                        <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto">
                          {activeProject.calculatedFields.map((calc) => (
                            <button
                              key={calc.id}
                              onClick={() => setSelectedCalcId(calc.id)}
                              className={`w-full text-left p-3 rounded-lg border text-xs transition duration-150 flex flex-col gap-1.5 relative overflow-hidden ${
                                selectedCalcId === calc.id
                                  ? "bg-amber-500/10 border-amber-500/40 text-white"
                                  : "bg-[#0d1117] border-gray-800 hover:border-gray-700 hover:bg-gray-800/30 text-gray-300"
                              }`}
                            >
                              <div className="flex justify-between items-center gap-1">
                                <span className="font-semibold truncate">{calc.name}</span>
                                <span
                                  className={`text-[8px] uppercase px-1.5 rounded font-mono ${
                                    calc.complexity === "High" || calc.complexity === "Critical"
                                      ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                      : calc.complexity === "Medium"
                                      ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  }`}
                                >
                                  {calc.complexity || "Medium"}
                                </span>
                              </div>
                              <code className="text-[11px] text-gray-500 truncate block font-mono">{calc.formula}</code>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Right side: Comparative code panels */}
                      <div className="lg:col-span-8 flex flex-col gap-5">
                        {selectedCalc ? (
                          <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5 space-y-4">
                            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
                              <div>
                                <h3 className="text-sm font-semibold text-white">{selectedCalc.name}</h3>
                                <p className="text-[11px] text-gray-400 mt-0.5 font-mono">XML Target: {selectedCalc.id}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {!selectedCalc.convertedDax ? (
                                  <button
                                    onClick={() => handleInlineConvert(selectedCalc)}
                                    className="bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs py-1.5 px-3 rounded-md flex items-center gap-1.5 transition"
                                  >
                                    <Cpu className="h-3.5 w-3.5" /> Convert calculation
                                  </button>
                                ) : (
                                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded flex items-center gap-1">
                                    <Check className="h-3.5 w-3.5" /> Verified
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Left: Original Tableau formula */}
                              <div className="space-y-2">
                                <span className="text-xs uppercase font-mono text-gray-500">Tableau Calculation formula</span>
                                <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-3.5 font-mono text-xs text-amber-500 min-h-[120px] whitespace-pre-wrap">
                                  {selectedCalc.formula}
                                </div>
                              </div>

                              {/* Right: DAX Target Code */}
                              <div className="space-y-2">
                                <span className="text-xs uppercase font-mono text-gray-500">Power BI DAX Equivalent</span>
                                <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-3.5 font-mono text-xs text-emerald-400 min-h-[120px] whitespace-pre-wrap">
                                  {selectedCalc.convertedDax || "No conversion yet. Click 'Convert calculation' above."}
                                </div>
                              </div>
                            </div>

                            {selectedCalc.convertedDax && (
                              <div className="space-y-3.5 border-t border-gray-800/60 pt-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                                  <div>
                                    <span className="text-xs uppercase font-mono text-gray-500 block mb-1">Architectural Explanations</span>
                                    <p className="text-gray-300 leading-relaxed text-[11px] bg-[#0d1117] border border-gray-800 p-3 rounded-lg">
                                      {selectedCalc.explanation}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-xs uppercase font-mono text-gray-500 block mb-1">Power Query M Statement</span>
                                    <p className="text-gray-300 leading-relaxed text-[11px] font-mono bg-[#0d1117] border border-gray-800 p-3 rounded-lg whitespace-pre-wrap">
                                      {selectedCalc.convertedM}
                                    </p>
                                  </div>
                                </div>

                                {selectedCalc.warnings && selectedCalc.warnings.length > 0 && (
                                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 flex gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                                    <div>
                                      <span className="text-[11px] font-bold text-amber-500 block">Semantic Warnings</span>
                                      <ul className="list-disc list-inside text-[11px] text-gray-400 mt-1 space-y-1">
                                        {selectedCalc.warnings.map((w, idx) => (
                                          <li key={idx}>{w}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-[#161b22] border border-gray-800 rounded-xl p-8 text-center text-gray-500 text-xs">
                            Please select an extracted calculated field from the list.
                          </div>
                        )}

                        {/* Interactive playground box */}
                        <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5 space-y-4">
                          <div className="flex justify-between items-center">
                            <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider flex items-center gap-1.5">
                              <Cpu className="h-4 w-4 text-amber-500" />
                              Custom Calculation Playground Sandbox
                            </h3>
                            <button
                              onClick={handlePlaygroundConvert}
                              disabled={isTranslatingPlayground}
                              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-semibold text-xs py-1.5 px-3 rounded-md flex items-center gap-1.5 transition"
                            >
                              {isTranslatingPlayground ? (
                                <>
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Translating...
                                </>
                              ) : (
                                <>
                                  <Play className="h-3.5 w-3.5 fill-black" /> Run Custom Translation
                                </>
                              )}
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                                <div>
                                  <label className="text-[10px] text-gray-500 block mb-1">Calculation Name</label>
                                  <input
                                    type="text"
                                    value={customFormulaName}
                                    onChange={(e) => setCustomFormulaName(e.target.value)}
                                    className="w-full bg-[#0d1117] border border-gray-800 rounded p-1.5 text-white text-xs focus:outline-none focus:border-amber-500/40"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 block mb-1">Context Table</label>
                                  <input
                                    type="text"
                                    value={customContext}
                                    onChange={(e) => setCustomContext(e.target.value)}
                                    className="w-full bg-[#0d1117] border border-gray-800 rounded p-1.5 text-white text-xs focus:outline-none focus:border-amber-500/40"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-[10px] font-mono text-gray-500 block mb-1">Type Tableau Formula</label>
                                <textarea
                                  rows={4}
                                  value={customTableauFormula}
                                  onChange={(e) => setCustomTableauFormula(e.target.value)}
                                  className="w-full bg-[#0d1117] border border-gray-800 rounded p-3 text-amber-500 font-mono text-xs focus:outline-none focus:border-amber-500/40"
                                />
                              </div>
                            </div>

                            <div className="space-y-3">
                              <label className="text-[10px] font-mono text-gray-500 block mb-1">Transpiled Target (DAX & PQ)</label>
                              <div className="bg-[#0d1117] border border-gray-800 rounded p-3 min-h-[170px] flex flex-col justify-between">
                                <div className="space-y-3">
                                  <code className="text-xs text-emerald-400 block font-mono whitespace-pre-wrap">
                                    {playgroundResult.dax}
                                  </code>
                                  <p className="text-[11px] text-gray-400 leading-relaxed border-t border-gray-800/60 pt-2">
                                    <span className="font-semibold text-gray-300">Explanation:</span> {playgroundResult.explanation}
                                  </p>
                                </div>
                                <div className="text-[10px] text-gray-500 font-mono flex justify-between pt-2 border-t border-gray-800/40">
                                  <span>Type: {playgroundResult.daxType}</span>
                                  <span>Complexity: {playgroundResult.complexity}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 5: Visual Replicator Layout Grid */}
                {activeTab === "visual" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Interactive Power BI Report Builder</h2>
                      <p className="text-xs text-gray-400 mt-1">
                        Tableau horizontal/vertical containers and worksheet visual profiles mapped to Power BI Canvas dashboards.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Left: Source-to-Target visual mapping list */}
                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5 lg:col-span-4 space-y-4">
                        <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider flex items-center gap-1.5">
                          <Grid className="h-3.5 w-3.5 text-amber-500" />
                          Visual Element Dictionary
                        </h3>
                        <div className="space-y-2.5 text-xs max-h-[420px] overflow-y-auto">
                          {[
                            { source: "Bar Chart", target: "Clustered Bar Chart", notes: "Direct match" },
                            { source: "Line Chart", target: "Line Chart", notes: "Use continuous calendar axis" },
                            { source: "Cross Tab / Text Table", target: "Matrix Visual", notes: "Optimized drillthrough" },
                            { source: "Heat Map", target: "Matrix with Conditional Formatting", notes: "Cell saturation" },
                            { source: "Pie / Donut", target: "Donut Chart", notes: "Preserve category limits" },
                            { source: "Map (Geographic)", target: "Filled Map / Shape Map", notes: "Ensure ISO country codes" },
                            { source: "KPI Grid", target: "Card / Multi-Row Card", notes: "Responsive measure mapping" },
                          ].map((item, idx) => (
                            <div key={idx} className="bg-[#0d1117] border border-gray-800 p-3 rounded-lg space-y-1.5">
                              <div className="flex justify-between items-center">
                                <span className="font-semibold text-white">{item.source}</span>
                                <span className="text-amber-500 font-mono text-[10px]">&rarr;</span>
                                <span className="font-semibold text-amber-500 font-mono text-[11px]">{item.target}</span>
                              </div>
                              <p className="text-[10px] text-gray-500">{item.notes}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Right: Interactive Report Mockup */}
                      <div className="lg:col-span-8 bg-[#161b22] border border-gray-800 rounded-xl p-5 flex flex-col gap-4">
                        <div className="flex justify-between items-center border-b border-gray-800 pb-3">
                          <div>
                            <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider">
                              Power BI Generated Dashboard Sandbox
                            </h3>
                            <p className="text-[11px] text-gray-500 mt-0.5">Mock canvas demonstrating reconstituted layout blocks</p>
                          </div>
                          <span className="text-[11px] font-mono bg-amber-500/10 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded">
                            Bento Page Canvas
                          </span>
                        </div>

                        {/* Interactive Report Grid Panel */}
                        <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-5 space-y-4">
                          {/* Slicers header */}
                          <div className="flex flex-wrap gap-3 items-center text-[11px] border-b border-gray-800/60 pb-3">
                            <span className="text-gray-500 font-mono uppercase">Page Slicers:</span>
                            <span className="bg-gray-800 text-white px-2 py-1 rounded border border-gray-700">Order Year: All</span>
                            <span className="bg-gray-800 text-white px-2 py-1 rounded border border-gray-700">Region: Europe</span>
                            <span className="bg-gray-800 text-white px-2 py-1 rounded border border-gray-700">Category: Technology</span>
                          </div>

                          {/* Bento Grid */}
                          <div className="grid grid-cols-3 gap-4">
                            {/* KPI 1 */}
                            <div className="bg-[#161b22] border border-gray-800 rounded-lg p-3.5 text-center">
                              <span className="text-[10px] text-gray-500 uppercase block font-mono">Reconciled Gross Sales</span>
                              <h4 className="text-xl font-bold text-emerald-400 mt-1">$12.64M</h4>
                              <span className="text-[9px] text-gray-500 font-mono mt-0.5 block">&plusmn;0% Variance</span>
                            </div>

                            {/* KPI 2 */}
                            <div className="bg-[#161b22] border border-gray-800 rounded-lg p-3.5 text-center">
                              <span className="text-[10px] text-gray-500 uppercase block font-mono">Net Profit Margins</span>
                              <h4 className="text-xl font-bold text-white mt-1">11.58%</h4>
                              <span className="text-[9px] text-gray-500 font-mono mt-0.5 block">Target Met (11.0%)</span>
                            </div>

                            {/* KPI 3 */}
                            <div className="bg-[#161b22] border border-gray-800 rounded-lg p-3.5 text-center">
                              <span className="text-[10px] text-gray-500 uppercase block font-mono">Direct Orders</span>
                              <h4 className="text-xl font-bold text-white mt-1">51.29K</h4>
                              <span className="text-[9px] text-gray-500 font-mono mt-0.5 block">100% reconciled</span>
                            </div>

                            {/* Main Chart Row */}
                            <div className="col-span-2 bg-[#161b22] border border-gray-800 rounded-lg p-4 h-48 flex flex-col justify-between">
                              <span className="text-[10px] text-gray-400 font-mono uppercase">Sales Trend Analysis (Power BI Clustered Column)</span>
                              {/* Simulated Bar Graphics */}
                              <div className="flex items-end gap-3.5 h-28 justify-center">
                                {[45, 60, 52, 78, 85, 95, 110].map((h, i) => (
                                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                                    <div className="w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-t" style={{ height: `${h}%` }} />
                                    <span className="text-[9px] font-mono text-gray-500">M{i+1}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Side table matrix */}
                            <div className="bg-[#161b22] border border-gray-800 rounded-lg p-4 h-48 flex flex-col justify-between text-[11px]">
                              <span className="text-[10px] text-gray-400 font-mono uppercase block mb-2">Region Matrix</span>
                              <div className="space-y-2 flex-1 overflow-y-auto">
                                <div className="flex justify-between border-b border-gray-800 pb-1">
                                  <span>North EU</span>
                                  <span className="font-mono text-emerald-400 font-semibold">$3.14M</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-800 pb-1">
                                  <span>Central EU</span>
                                  <span className="font-mono text-emerald-400 font-semibold">$4.85M</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-800 pb-1">
                                  <span>South EU</span>
                                  <span className="font-mono text-white">$2.45M</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 6: Validation & Reconciliation Sandbox */}
                {activeTab === "validation" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Automated Reconciliation Sandbox</h2>
                      <p className="text-xs text-gray-400 mt-1">
                        Compare extracted metrics, row counts, and aggregation results of the migrated semantic model against the source Tableau file stats.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Left Control Panel */}
                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5 space-y-5 flex flex-col justify-between">
                        <div className="space-y-4">
                          <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider flex items-center gap-1.5">
                            <Settings className="h-4 w-4 text-amber-500" />
                            Reconciliation Settings
                          </h3>

                          <div>
                            <label className="text-xs text-gray-400 block mb-1">Variance Tolerance Limit (&plusmn; %)</label>
                            <div className="flex items-center gap-3">
                              <input
                                type="range"
                                min="0.0"
                                max="1.0"
                                step="0.1"
                                value={tolerance}
                                onChange={(e) => setTolerance(parseFloat(e.target.value))}
                                className="flex-1 accent-amber-500 cursor-pointer h-1.5 bg-gray-800 rounded"
                              />
                              <span className="text-xs font-mono font-semibold text-white bg-gray-800 border border-gray-700 px-2.5 py-1 rounded">
                                {tolerance.toFixed(1)}%
                              </span>
                            </div>
                            <span className="text-[10px] text-gray-500 mt-1 block">Allowable aggregate margin mismatch before triggering pipeline failure.</span>
                          </div>

                          <div className="space-y-2 text-xs font-mono">
                            <div className="flex justify-between p-2 rounded bg-[#0d1117] border border-gray-800">
                              <span className="text-gray-400">Target Server:</span>
                              <span className="text-white">DirectLake_Engine</span>
                            </div>
                            <div className="flex justify-between p-2 rounded bg-[#0d1117] border border-gray-800">
                              <span className="text-gray-400">Source Extract:</span>
                              <span className="text-white">Tableau_Hyper_Direct</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={runReconciliation}
                          disabled={isValidating}
                          className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-semibold text-xs py-3 rounded-lg flex items-center justify-center gap-2 transition mt-4"
                        >
                          {isValidating ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" /> Verifying schemas & sums...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4" /> Run Automated Reconciliation
                            </>
                          )}
                        </button>
                      </div>

                      {/* Right Comparative Matrix */}
                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5 lg:col-span-2 space-y-4">
                        <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider">
                          Side-by-Side Reconciliation Matrix
                        </h3>

                        <div className="border border-gray-800 rounded-lg overflow-hidden text-xs">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[#0d1117] border-b border-gray-800 text-gray-400 font-mono text-[10px] uppercase">
                                <th className="p-3">Audit Metric Name</th>
                                <th className="p-3 text-right">Tableau Value</th>
                                <th className="p-3 text-right">Power BI Value</th>
                                <th className="p-3 text-right">Variance</th>
                                <th className="p-3 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/60 font-mono">
                              {activeProject.validation?.results.map((res, i) => (
                                <tr key={i} className="hover:bg-gray-800/20">
                                  <td className="p-3 font-sans text-white font-semibold">{res.metricName}</td>
                                  <td className="p-3 text-right">
                                    {typeof res.tableauValue === "number" ? res.tableauValue.toLocaleString() : res.tableauValue}
                                  </td>
                                  <td className="p-3 text-right">
                                    {typeof res.powerBiValue === "number" ? res.powerBiValue.toLocaleString() : res.powerBiValue}
                                  </td>
                                  <td className="p-3 text-right text-emerald-400">{res.variance === 0 ? "0" : res.variance.toLocaleString()}</td>
                                  <td className="p-3 text-center">
                                    <span
                                      className={`text-[9px] uppercase px-2 py-0.5 rounded font-bold border ${
                                        res.status === "Pass"
                                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                          : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                      }`}
                                    >
                                      {res.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 7: Deployment Hub / BIM Exporter */}
                {activeTab === "export" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Power BI Deployment Engine</h2>
                      <p className="text-xs text-gray-400 mt-1">
                        Export production-ready Tabular Object Model (TOM) schemas, semantic models, and deploy directly to enterprise workspaces.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Left: Downloader Blocks */}
                      <div className="space-y-4">
                        <div className="bg-[#161b22] border border-gray-800 rounded-xl p-6 space-y-4">
                          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                            <Download className="h-4.5 w-4.5 text-amber-500" /> Download Power BI Artifacts
                          </h3>
                          <p className="text-xs text-gray-400 leading-relaxed">
                            Generate and download valid Tabular Model metadata (BIM schema) and Power Query ETL statements matching the analyzed workbook.
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                            <button
                              onClick={handleDownloadBim}
                              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition"
                            >
                              <FileCode className="h-4 w-4" /> Download TOM Model (.BIM)
                            </button>
                            <button
                              onClick={() => {
                                const mScript = `let\n    Source = Sql.Database("${activeProject.metadata?.datasources[0].connection.server || "localhost"}", "${activeProject.metadata?.datasources[0].connection.database || "warehouse"}"),\n    Orders = Source{[Schema="dbo",Item="fact_orders"]}[Data]\nin\n    Orders`;
                                const blob = new Blob([mScript], { type: "text/plain" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = "Power_Query_M_Script.txt";
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                              }}
                              className="bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 font-semibold text-xs py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition"
                            >
                              <Terminal className="h-4 w-4" /> Download M Script (PQ)
                            </button>
                          </div>
                          <span className="text-[10px] text-gray-500 block">
                            The .BIM file can be directly imported into Tabular Editor, SSAS, or Power BI Desktop.
                          </span>
                        </div>

                        {/* PDF Report preview */}
                        <div className="bg-[#161b22] border border-gray-800 rounded-xl p-6 space-y-4">
                          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                            <FileText className="h-4.5 w-4.5 text-amber-500" /> Export Migration Audit PDF
                          </h3>
                          <p className="text-xs text-gray-400 leading-relaxed">
                            Produce a comprehensive executive migration audit report detailing converted logic, successfully reconciled rows, and list of outstanding warnings.
                          </p>
                          <button
                            onClick={() => window.print()}
                            className="bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 font-semibold text-xs py-2.5 px-4 rounded-lg flex items-center gap-2 justify-center transition"
                          >
                            <FileText className="h-4 w-4" /> Print / Save Migration PDF Report
                          </button>
                        </div>
                      </div>

                      {/* Right: Direct Cloud Workspace Publisher */}
                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-6 flex flex-col justify-between">
                        <div className="space-y-4">
                          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                            <Shield className="h-4.5 w-4.5 text-amber-500" /> Direct Power BI Cloud Deployment
                          </h3>
                          <p className="text-xs text-gray-400 leading-relaxed">
                            Deploy the reconstituted model and bento grid layout dashboards directly to Microsoft Fabric / Power BI Premium Workspaces via REST XMLA APIs.
                          </p>

                          <div className="space-y-3.5 text-xs font-mono pt-2">
                            <div>
                              <span className="text-[10px] text-gray-500 block mb-1">Target Tenant ID</span>
                              <span className="text-white block bg-[#0d1117] border border-gray-800 p-2.5 rounded">
                                enterprise-corp-microsoft-fabric.fabric.microsoft.com
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-gray-500 block mb-1">Target Workspace</span>
                              <span className="text-white block bg-[#0d1117] border border-gray-800 p-2.5 rounded">
                                EU_Premium_DirectLake_Retail_Marts
                              </span>
                            </div>
                          </div>
                        </div>

                        {deploySuccess && (
                          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-xs text-emerald-400 flex items-start gap-2 mt-4">
                            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold block">Deployment Successful</span>
                              <span className="text-[10px] text-gray-400 block mt-0.5">Semantic Model published to Power BI service successfully.</span>
                            </div>
                          </div>
                        )}

                        <button
                          onClick={deploySemanticModel}
                          disabled={isDeploying}
                          className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-semibold text-xs py-3 rounded-lg flex items-center justify-center gap-2 transition mt-6"
                        >
                          {isDeploying ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" /> Accessing Microsoft Fabric Gateway...
                            </>
                          ) : (
                            <>
                              <Layers className="h-4 w-4" /> Publish to Power BI Workspace
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 8: System Blueprints & Deliverables */}
                {activeTab === "blueprints" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-lg font-semibold text-white">System Architecture & Deliverables</h2>
                      <p className="text-xs text-gray-400 mt-1">
                        Enterprise architecture, Sequence charts, REST API schema, and source-to-target formula mappings as specified in solutions architect deliverables.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Diagram 1: System Architecture */}
                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5 space-y-4">
                        <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider flex items-center gap-1.5">
                          <Layers className="h-4 w-4 text-amber-500" />
                          Enterprise Integration Pipeline Diagram
                        </h3>
                        {/* Styled SVG Architecture block diagram */}
                        <div className="bg-[#0d1117] border border-gray-800 rounded-lg p-4 flex justify-center items-center">
                          <svg className="w-full h-auto max-w-md" viewBox="0 0 400 240">
                            {/* Layer 1: Tableau Workbook */}
                            <rect x="10" y="10" width="100" height="40" rx="4" fill="#0f172a" stroke="#6366f1" strokeWidth="1.5" />
                            <text x="60" y="34" fill="#fff" fontSize="10" textAnchor="middle" fontWeight="bold">TWB / TWBX</text>
                            <text x="60" y="44" fill="#475569" fontSize="8" textAnchor="middle">XML Document</text>

                            {/* Arrow */}
                            <path d="M 110 30 L 140 30" stroke="#f59e0b" strokeWidth="1.5" fill="none" markerEnd="url(#arrow)" />

                            {/* Layer 2: Express Server Parsing */}
                            <rect x="150" y="10" width="100" height="40" rx="4" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.5" />
                            <text x="200" y="34" fill="#fff" fontSize="10" textAnchor="middle" fontWeight="bold">Express Service</text>
                            <text x="200" y="44" fill="#475569" fontSize="8" textAnchor="middle">Node Parser / Regex</text>

                            {/* Arrow */}
                            <path d="M 250 30 L 280 30" stroke="#f59e0b" strokeWidth="1.5" fill="none" />

                            {/* Layer 3: Gemini translation */}
                            <rect x="290" y="10" width="100" height="40" rx="4" fill="#1e1b4b" stroke="#8b5cf6" strokeWidth="1.5" />
                            <text x="340" y="34" fill="#fff" fontSize="10" textAnchor="middle" fontWeight="bold">Gemini 3.5 AI</text>
                            <text x="340" y="44" fill="#a78bfa" fontSize="8" textAnchor="middle">DAX Translation</text>

                            {/* Down arrow from 2 to 4 */}
                            <path d="M 200 50 L 200 100" stroke="#f59e0b" strokeWidth="1.5" fill="none" />

                            {/* Layer 4: TOM Schema BIM */}
                            <rect x="140" y="110" width="120" height="40" rx="4" fill="#0f172a" stroke="#10b981" strokeWidth="1.5" />
                            <text x="200" y="134" fill="#fff" fontSize="10" textAnchor="middle" fontWeight="bold">Tabular Model Schema</text>
                            <text x="200" y="144" fill="#4ade80" fontSize="8" textAnchor="middle">.BIM Format JSON</text>

                            {/* Down arrow from 4 to 5 */}
                            <path d="M 200 150 L 200 200" stroke="#f59e0b" strokeWidth="1.5" fill="none" />

                            {/* Layer 5: Power BI / Fabric */}
                            <rect x="130" y="210" width="140" height="25" rx="4" fill="#451a03" stroke="#f59e0b" strokeWidth="1.5" />
                            <text x="200" y="226" fill="#fff" fontSize="10" textAnchor="middle" fontWeight="bold">Power BI REST Gateway</text>
                          </svg>
                        </div>
                      </div>

                      {/* Sequence Mappings */}
                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5 space-y-4">
                        <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider flex items-center gap-1.5">
                          <Layers className="h-4 w-4 text-amber-500" />
                          Source-to-Target Function Mapping Matrix
                        </h3>
                        <div className="border border-gray-800 rounded-lg overflow-hidden text-xs max-h-60 overflow-y-auto">
                          <table className="w-full text-left border-collapse font-mono">
                            <thead>
                              <tr className="bg-[#0d1117] border-b border-gray-800 text-gray-400 text-[10px] uppercase">
                                <th className="p-3">Tableau Function</th>
                                <th className="p-3">DAX Equivalent</th>
                                <th className="p-3">Complexity</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/60 text-gray-300">
                              {[
                                { t: "ZN(expression)", d: "COALESCE(expression, 0)", c: "Low" },
                                { t: "IFNULL(x, y)", d: "COALESCE(x, y)", c: "Low" },
                                { t: "LOOKUP(sum(x), -1)", d: "DATEADD(Date, -1, YEAR)", c: "Medium" },
                                { t: "FIXED [Dim] : SUM(x)", d: "CALCULATE(SUM(x), ALLEXCEPT(...))", c: "High" },
                                { t: "WINDOW_SUM(x, -3, 0)", d: "CALCULATE(x, FILTER(..., Date <= Max))", c: "High" },
                              ].map((item, idx) => (
                                <tr key={idx}>
                                  <td className="p-2.5 text-amber-500">{item.t}</td>
                                  <td className="p-2.5 text-emerald-400">{item.d}</td>
                                  <td className="p-2.5 text-gray-400 font-sans">{item.c}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* API Endpoints documentation */}
                      <div className="bg-[#161b22] border border-gray-800 rounded-xl p-5 space-y-4 lg:col-span-2">
                        <h3 className="text-xs uppercase font-semibold text-gray-400 tracking-wider flex items-center gap-1.5">
                          <Terminal className="h-4 w-4 text-amber-500" />
                          REST Service API Contracts
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                          <div className="bg-[#0d1117] border border-gray-800 p-3.5 rounded-lg space-y-2">
                            <span className="text-emerald-400 font-bold block">POST /api/analyze-workbook</span>
                            <p className="text-[11px] text-gray-400">Parses raw Tableau workbook XML. Extracts datasources, columns, parameters, and layout zones.</p>
                          </div>
                          <div className="bg-[#0d1117] border border-gray-800 p-3.5 rounded-lg space-y-2">
                            <span className="text-emerald-400 font-bold block">POST /api/convert-formula</span>
                            <p className="text-[11px] text-gray-400">Invokes Google Gemini 3.5 models server-side to transpile calculations to DAX and M scripts.</p>
                          </div>
                          <div className="bg-[#0d1117] border border-gray-800 p-3.5 rounded-lg space-y-2">
                            <span className="text-emerald-400 font-bold block">POST /api/generate-bim</span>
                            <p className="text-[11px] text-gray-400">Serializes the mapped tables, parameters, relationships, and measures to standard TOM .BIM schema.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
