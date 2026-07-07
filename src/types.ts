export interface ProjectConnection {
  type: string;
  server: string;
  database: string;
  schema: string;
}

export interface TableauTable {
  table: string;
  name: string;
}

export interface TableauColumn {
  name: string;
  id: string;
  datatype: string;
  role: string;
  type?: string;
}

export interface CalculatedField {
  name: string;
  id: string;
  formula: string;
  datatype: string;
  role: string;
  convertedDax?: string;
  convertedM?: string;
  explanation?: string;
  complexity?: "Low" | "Medium" | "High" | "Critical";
  daxType?: "Measure" | "Calculated Column" | "Calculated Table";
  warnings?: string[];
  status?: "Pending" | "Converted" | "Error" | "Verified";
}

export interface TableauDatasource {
  id: string;
  name: string;
  connection: ProjectConnection;
  tables: TableauTable[];
  columns: TableauColumn[];
  calculatedFields: CalculatedField[];
}

export interface TableauWorksheet {
  name: string;
  visualType: string;
  filters: Array<{ column: string }>;
}

export interface TableauDashboard {
  name: string;
  sheets: string[];
  layout: string;
}

export interface WorkbookMetadata {
  name: string;
  version: string;
  author: string;
  createdDate: string;
  publishedDate: string;
  datasources: TableauDatasource[];
  worksheets: TableauWorksheet[];
  dashboards: TableauDashboard[];
  parameters: Array<{ id: string; name: string; datatype: string }>;
  unsupportedFeatures: string[];
}

export interface DataModelAnalysis {
  schemaType: string;
  factTables: string[];
  dimensionTables: string[];
  bridgeTables: string[];
  relationships: Array<{
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    cardinality: string;
    direction: string;
    status: string;
  }>;
}

export interface ValidationSummary {
  rowCountMatch: boolean;
  columnCountMatch: boolean;
  totalsMatch: boolean;
  kpiMatch: boolean;
  discrepancyCount: number;
  results: Array<{
    metricName: string;
    tableauValue: number | string;
    powerBiValue: number | string;
    variance: number;
    status: "Pass" | "Fail" | "Warning";
  }>;
}

export interface MigrationProject {
  id: string;
  name: string;
  status: "Pending" | "Analyzing" | "Extracted" | "Converting" | "Validated" | "Completed" | "Failed";
  progress: number;
  tableauFileName: string;
  createdDate: string;
  metadata: WorkbookMetadata | null;
  dataModel: DataModelAnalysis | null;
  calculatedFields: CalculatedField[];
  validation: ValidationSummary | null;
  logs: Array<{ timestamp: string; level: "info" | "warn" | "error" | "success"; message: string }>;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  project: string;
  user: string;
  action: string;
  status: "Success" | "Warning" | "Failure";
  details: string;
}
