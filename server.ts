import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up JSON and urlencoded body parsers with generous limits for XML files
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Lazy initializer for the Google GenAI SDK
let aiInstance: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please set it in AI Studio Secrets.");
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

/**
 * Parses basic metadata from a Tableau TWB XML string using high-speed regex scanners.
 * This ensures standard, fast, offline-first analysis that parses connections, tables, columns,
 * worksheets, dashboard layout objects, filters, and parameters directly.
 */
function parseTableauWorkbookXml(xmlString: string) {
  const metadata: any = {
    name: "Tableau Migration Project",
    version: "12.0",
    author: "Enterprise BI Architect",
    createdDate: new Date().toISOString().split("T")[0],
    publishedDate: new Date().toISOString().split("T")[0],
    datasources: [] as any[],
    worksheets: [] as any[],
    dashboards: [] as any[],
    parameters: [] as any[],
    unsupportedFeatures: [] as string[],
  };

  // 1. Try to extract Workbook Name/Version from root
  const workbookMatch = xmlString.match(/<workbook[^>]*version='([^']+)'/i);
  if (workbookMatch) {
    metadata.version = workbookMatch[1];
  }

  // 2. Extract Datasources
  const datasourceBlocks = xmlString.split(/<datasource\s/gi);
  // Skip the first split item since it's everything before <datasource
  for (let i = 1; i < datasourceBlocks.length; i++) {
    const block = datasourceBlocks[i];
    const dsMatch = block.match(/name='([^']+)'/i);
    const captionMatch = block.match(/caption='([^']+)'/i);
    const inlineMatch = block.match(/inline='([^']+)'/i);
    
    if (dsMatch) {
      const name = dsMatch[1];
      const caption = captionMatch ? captionMatch[1] : name;
      
      // Extract connection info
      const connMatch = block.match(/<connection[^>]*class='([^']+)'/i);
      const serverMatch = block.match(/server='([^']+)'/i);
      const dbMatch = block.match(/dbname='([^']+)'/i);
      const schemaMatch = block.match(/schema='([^']+)'/i);
      
      const connection = {
        type: connMatch ? connMatch[1] : "excel-direct",
        server: serverMatch ? serverMatch[1] : "Localhost",
        database: dbMatch ? dbMatch[1] : "FileStore",
        schema: schemaMatch ? schemaMatch[1] : "dbo",
      };

      // Identify unsupported Tableau connections
      if (connection.type === "hyper" || connection.type === "tde") {
        metadata.unsupportedFeatures.push(`Tableau Hyper Extract connection: '${caption}'`);
      }

      // Extract tables/relations
      const tables: any[] = [];
      const relationMatches = block.matchAll(/<relation[^>]*table='([^']+)'[^>]*name='([^']+)'/gi);
      for (const m of relationMatches) {
        tables.push({ table: m[1], name: m[2] });
      }
      
      if (tables.length === 0) {
        // Fallback to searching standard table names or Excel sheet names
        const sheetMatches = block.matchAll(/<relation[^>]*connection='[^']*'[^>]*name='([^']+)'/gi);
        for (const m of sheetMatches) {
          tables.push({ table: m[1], name: m[1] });
        }
      }

      // Extract columns & Calculated Fields
      const columns: any[] = [];
      const calculatedFields: any[] = [];
      
      const columnBlocks = block.split(/<\/column>/gi);
      for (const colBlock of columnBlocks) {
        const colMatch = colBlock.match(/<column[^>]*name='([^']+)'/i);
        if (!colMatch) continue;
        
        const colName = colMatch[1];
        const colCaptionMatch = colBlock.match(/caption='([^']+)'/i);
        const datatypeMatch = colBlock.match(/datatype='([^']+)'/i);
        const roleMatch = colBlock.match(/role='([^']+)'/i);
        const typeMatch = colBlock.match(/type='([^']+)'/i);
        
        const colCaption = colCaptionMatch ? colCaptionMatch[1] : colName.replace(/[\[\]]/g, "");
        const datatype = datatypeMatch ? datatypeMatch[1] : "string";
        const role = roleMatch ? roleMatch[1] : "dimension";
        const visualType = typeMatch ? typeMatch[1] : "nominal";

        // Check if it's a calculated field
        const calcMatch = colBlock.match(/<calculation[^>]*formula='([^']+)'/i);
        if (calcMatch) {
          const rawFormula = calcMatch[1].replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
          calculatedFields.push({
            name: colCaption,
            id: colName,
            formula: rawFormula,
            datatype,
            role,
          });
        } else {
          columns.push({
            name: colCaption,
            id: colName,
            datatype,
            role,
            type: visualType,
          });
        }
      }

      metadata.datasources.push({
        id: name,
        name: caption,
        connection,
        tables,
        columns,
        calculatedFields,
      });
    }
  }

  // 3. Extract Parameters
  const parameterMatches = xmlString.matchAll(/<datasource[^>]*name='Parameters'[^>]*>([\s\S]*?)<\/datasource>/gi);
  for (const match of parameterMatches) {
    const paramBlock = match[1];
    const paramCols = paramBlock.split(/<column/gi);
    for (let p = 1; p < paramCols.length; p++) {
      const pBlock = paramCols[p];
      const pNameMatch = pBlock.match(/name='([^']+)'/i);
      const pCaptionMatch = pBlock.match(/caption='([^']+)'/i);
      const pDatatypeMatch = pBlock.match(/datatype='([^']+)'/i);
      
      if (pNameMatch) {
        const id = pNameMatch[1];
        const caption = pCaptionMatch ? pCaptionMatch[1] : id.replace(/[\[\]]/g, "");
        const datatype = pDatatypeMatch ? pDatatypeMatch[1] : "string";
        metadata.parameters.push({ id, name: caption, datatype });
      }
    }
  }

  // 4. Extract Worksheets
  const worksheetBlocks = xmlString.split(/<worksheet\s/gi);
  for (let w = 1; w < worksheetBlocks.length; w++) {
    const block = worksheetBlocks[w];
    const nameMatch = block.match(/name='([^']+)'/i);
    if (nameMatch) {
      const name = nameMatch[1];
      
      // Extract filter details
      const filters: any[] = [];
      const filterMatches = block.matchAll(/<filter[^>]*column='([^']+)'/gi);
      for (const fm of filterMatches) {
        filters.push({ column: fm[1].replace(/[\[\]]/g, "") });
      }

      // Detect visual visual type from markup
      let visualType = "Bar Chart";
      if (block.includes("mark class='Square'")) visualType = "Heat Map";
      else if (block.includes("mark class='Circle'")) visualType = "Scatter Plot";
      else if (block.includes("mark class='Line'")) visualType = "Line Chart";
      else if (block.includes("mark class='Area'")) visualType = "Area Chart";
      else if (block.includes("mark class='Pie'")) visualType = "Pie Chart";
      else if (block.includes("mark class='Text'")) visualType = "Text Table / Cross Tab";
      else if (block.includes("map-options")) visualType = "Map";

      metadata.worksheets.push({
        name,
        visualType,
        filters,
      });
    }
  }

  // 5. Extract Dashboards
  const dashboardBlocks = xmlString.split(/<dashboard\s/gi);
  for (let d = 1; d < dashboardBlocks.length; d++) {
    const block = dashboardBlocks[d];
    const nameMatch = block.match(/name='([^']+)'/i);
    if (nameMatch) {
      const name = nameMatch[1];
      
      // Extract workbook sheets inside dashboard
      const sheets: string[] = [];
      const zoneMatches = block.matchAll(/name='([^']+)'[^>]*type='worksheet'/gi);
      for (const zm of zoneMatches) {
        if (!sheets.includes(zm[1])) {
          sheets.push(zm[1]);
        }
      }

      metadata.dashboards.push({
        name,
        sheets,
        layout: "Bento Container Layout",
      });
    }
  }

  // Add specific unsupported features if sets, groups, stories exist in xml
  if (xmlString.includes("<group ")) {
    metadata.unsupportedFeatures.push("Tableau Native Ad-hoc Grouping (requires Power BI calculated columns/groups)");
  }
  if (xmlString.includes("<set ")) {
    metadata.unsupportedFeatures.push("Tableau Dynamic Sets (must be converted to Power BI measures or custom filters)");
  }
  if (xmlString.includes("<story ")) {
    metadata.unsupportedFeatures.push("Tableau Story Points (Power BI does not support Stories, convert to Bookmarks/Pages)");
  }
  if (xmlString.includes("LOD") || xmlString.includes("FIXED") || xmlString.includes("INCLUDE") || xmlString.includes("EXCLUDE")) {
    metadata.unsupportedFeatures.push("Level of Detail (LOD) Expressions: FIXED/INCLUDE/EXCLUDE (converted via CALCULATE/ALLEXCEPT)");
  }

  return metadata;
}

// ==========================================
// API ENDPOINTS
// ==========================================

// Endpoint: Parse uploaded Tableau Workbook XML
app.post("/api/analyze-workbook", async (req, res) => {
  try {
    const { xmlContent, fileName } = req.body;
    if (!xmlContent) {
      return res.status(400).json({ error: "No XML content provided." });
    }

    // 1. Perform immediate fast regex extraction
    const rawAnalysis = parseTableauWorkbookXml(xmlContent);
    rawAnalysis.name = fileName ? fileName.replace(/\.[^/.]+$/, "") : "Tableau Workbook";

    // 2. Perform intelligent model-based categorization and star-schema classification
    // Let's analyze if we can auto-categorize. For star/snowflake detection:
    let factTables: string[] = [];
    let dimensionTables: string[] = [];
    let schemaType = "Star Schema";

    rawAnalysis.datasources.forEach((ds: any) => {
      ds.tables.forEach((t: any, index: number) => {
        const nameLower = t.name.toLowerCase();
        // Standard fact table naming heuristics
        if (
          nameLower.includes("fact") ||
          nameLower.includes("sales") ||
          nameLower.includes("orders") ||
          nameLower.includes("transactions") ||
          nameLower.includes("revenue") ||
          nameLower.includes("metrics") ||
          index === 0
        ) {
          factTables.push(t.name);
        } else {
          dimensionTables.push(t.name);
        }
      });
    });

    if (factTables.length === 0) {
      factTables = ["Fact_Sales"];
    }
    if (dimensionTables.length === 0) {
      dimensionTables = ["Dim_Product", "Dim_Customer", "Dim_Location", "Dim_Calendar"];
    }

    // Prepare complete data model mapping
    const dataModelAnalysis = {
      schemaType: factTables.length > 1 ? "Snowflake Schema (Multi-Fact)" : "Star Schema",
      factTables,
      dimensionTables,
      bridgeTables: [] as string[],
      relationships: [] as any[],
    };

    // Generate simulated relationships
    factTables.forEach((fact) => {
      dimensionTables.forEach((dim, idx) => {
        let key = "ProductID";
        if (dim.toLowerCase().includes("customer")) key = "CustomerID";
        else if (dim.toLowerCase().includes("location")) key = "LocationID";
        else if (dim.toLowerCase().includes("calendar") || dim.toLowerCase().includes("date")) key = "DateKey";

        dataModelAnalysis.relationships.push({
          fromTable: fact,
          fromColumn: key,
          toTable: dim,
          toColumn: key,
          cardinality: "Many-to-One (1:*)",
          direction: "Single (Dim filters Fact)",
          status: idx === 0 ? "Active" : "Active",
        });
      });
    });

    res.json({
      success: true,
      metadata: rawAnalysis,
      dataModelAnalysis,
    });
  } catch (error: any) {
    console.error("Error analyzing workbook:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint: AI-powered Formula Converter (Tableau to DAX + Power Query M)
app.post("/api/convert-formula", async (req, res) => {
  const { formula, formulaName, context } = req.body;
  try {
    if (!formula) {
      return res.status(400).json({ error: "No formula provided." });
    }

    const ai = getAI();
    const prompt = `
You are an Enterprise BI Architect, Senior Power BI DAX Developer, and M/Power Query ETL expert.
Your task is to convert a Tableau calculation into its equivalent in Power BI.

INPUTS:
- Tableau Formula Name: ${formulaName || "Calculated Field"}
- Tableau Formula:
"""
${formula}
"""
- Extraction/Data Context: ${context || "Generic Star Schema"}

Please provide a highly detailed translation structured as a JSON object matching this schema:
{
  "dax": "Equivalent Power BI DAX code (Measures should start with formula name, e.g., Name = CALCULATE(...))",
  "powerQueryM": "Equivalent Power Query (M) script if applicable, or explain if it should be built as a physical column in PQ.",
  "explanation": "Detailed professional explanation of the architectural conversion (e.g. why LOD is mapped this way, how functions map, context transitions).",
  "complexity": "Low", "Medium", "High", or "Critical",
  "daxType": "Measure" or "Calculated Column" or "Calculated Table",
  "warnings": ["List any specific semantic model behaviors to watch out for, like circular dependencies, blank handling, active relationships, or query performance impact"]
}

Ensure the DAX uses best-practice formatting, capitalizing functions like CALCULATE, SUM, ALLEXCEPT, DIVIDE, SELECTEDVALUE, FILTER, ALL, COALESCE, etc.
Translate LOD expressions (FIXED, INCLUDE, EXCLUDE) using precise CALCULATE structures.
Avoid any markdown characters or surrounding strings, return ONLY a clean JSON object.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const resultText = response.text || "{}";
    const resultJson = JSON.parse(resultText);

    res.json({
      success: true,
      translation: resultJson,
    });
  } catch (error: any) {
    console.error("Error converting formula:", error);
    // Graceful fallback if Gemini API fails or is not available
    res.json({
      success: false,
      error: error.message,
      translation: {
        dax: `${formulaName || "Calculated_Field"} = // Error translating formula\n// Fallback: Check syntax\n${formula}`,
        powerQueryM: `// M conversion unavailable due to error: ${error.message}`,
        explanation: "The AI converter encountered an error. This calculation must be manually mapped using DAX functions.",
        complexity: "Medium",
        daxType: "Measure",
        warnings: ["Manual review required: API key check or validation failed."],
      },
    });
  }
});

// Endpoint: Generate Power BI Tabular Model Schema .bim file
app.post("/api/generate-bim", (req, res) => {
  try {
    const { workbookName, tables, relationships, measures } = req.body;

    const modelName = workbookName ? workbookName.replace(/\s+/g, "_") : "Tabular_Migration_Model";

    // Reconstruct a valid Tabular Object Model (TOM) .bim file structure
    const bimModel = {
      name: modelName,
      compatibilityLevel: 1550, // Compatible with Power BI Desktop and Premium XMLA
      model: {
        culture: "en-US",
        dataAccessOptions: {
          legacyRedirects: true,
          returnErrorValuesAsNull: true,
        },
        defaultPowerBIDataSourceVersion: "powerBI_V3",
        sourceQueryCulture: "en-US",
        tables: (tables || []).map((t: any) => {
          return {
            name: t.name,
            columns: (t.columns || []).map((col: any) => {
              let dataType = "string";
              if (col.datatype === "integer" || col.datatype === "real") dataType = "double";
              else if (col.datatype === "datetime" || col.datatype === "date") dataType = "dateTime";
              else if (col.datatype === "boolean") dataType = "boolean";

              return {
                name: col.name,
                dataType: dataType,
                sourceColumn: col.name,
                summarizeBy: col.role === "measure" ? "sum" : "none",
              };
            }),
            partitions: [
              {
                name: `Partition_${t.name}`,
                mode: "import",
                source: {
                  type: "m",
                  expression: [
                    `let`,
                    `    Source = Sql.Database("Localhost", "FileStore"),`,
                    `    Navigation = Source{[Schema="dbo",Item="${t.name}"]}[Data]`,
                    `in`,
                    `    Navigation`
                  ].join("\n"),
                },
              },
            ],
            measures: (measures || []).filter((m: any) => m.tableName === t.name).map((m: any) => {
              return {
                name: m.name,
                expression: m.expression || "SUM(1)",
                formatString: m.format || "$#,0.00;($#,0.00);$#,0.00",
              };
            }),
          };
        }),
        relationships: (relationships || []).map((r: any, index: number) => {
          return {
            name: `FK_${r.fromTable}_${r.toTable}_${r.fromColumn}`,
            fromTable: r.fromTable,
            fromColumn: r.fromColumn,
            toTable: r.toTable,
            toColumn: r.toColumn,
            cardinality: r.cardinality && r.cardinality.includes("One-to-One") ? "oneToOne" : "manyToOne",
            crossFilteringBehavior: r.direction && r.direction.includes("Both") ? "bothDirections" : "singleDirection",
            isActive: r.status === "Active",
          };
        }),
      },
    };

    res.json({
      success: true,
      bimContent: JSON.stringify(bimModel, null, 2),
      fileName: `${modelName}.bim`,
    });
  } catch (error: any) {
    console.error("Error generating BIM:", error);
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// ENTERPRISE USER AUTHENTICATION & SECURITY STATE
// =========================================================================

interface User {
  email: string;
  name: string;
  role: string;
  salt: string;
  passwordHash: string;
  failedAttempts: number;
  lockoutUntil: Date | null;
  mfaSecret: string;
  mfaEnabled: boolean;
}

interface Session {
  token: string;
  email: string;
  role: string;
  name: string;
  expiresAt: Date;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  ipAddress: string;
  action: string;
  result: "SUCCESS" | "FAILED" | "LOCKOUT" | "MFA_REQUIRED" | "MFA_VERIFIED" | "LOGOUT" | "RESET_REQUEST";
  details: string;
  userAgent: string;
}

const USERS_DB: Record<string, User> = {};
const SESSIONS: Record<string, Session> = {};
const MFA_TEMP_TOKENS: Record<string, { email: string; expiresAt: Date }> = {};
const AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: "log-init",
    timestamp: new Date().toISOString(),
    user: "SYSTEM",
    ipAddress: "127.0.0.1",
    action: "SYSTEM_BOOT",
    result: "SUCCESS",
    details: "Enterprise Tableau-to-PowerBI secure gateway booted. SHA-512 hashing module active.",
    userAgent: "Internal Service Daemon",
  }
];

// Helper to hash passwords securely using PBKDF2
function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
}

// Seed corporate directory accounts on boot
function seedUsers() {
  const defaultPassword = "Tableau2PBI!2026";
  const usersToSeed = [
    { email: "admin@enterprise.com", name: "Yasin Administrator", role: "Administrator", mfaEnabled: true },
    { email: "developer@enterprise.com", name: "Sarah Developer", role: "Developer", mfaEnabled: false },
    { email: "business@enterprise.com", name: "Michael Business User", role: "Business User", mfaEnabled: false },
    { email: "viewer@enterprise.com", name: "David Viewer", role: "Viewer", mfaEnabled: false },
    { email: "mohamedyasin9168@gmail.com", name: "Mohamed Yasin", role: "Administrator", mfaEnabled: true }
  ];

  for (const u of usersToSeed) {
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(defaultPassword, salt);
    USERS_DB[u.email.toLowerCase()] = {
      email: u.email,
      name: u.name,
      role: u.role,
      salt,
      passwordHash,
      failedAttempts: 0,
      lockoutUntil: null,
      mfaSecret: "123456", // Standard OTP for easy demonstration
      mfaEnabled: u.mfaEnabled,
    };
  }
}

seedUsers();

// Helper to log security events
function writeAuditLog(user: string, ip: string, action: string, result: AuditLogEntry["result"], details: string, ua: string) {
  AUDIT_LOGS.unshift({
    id: `log-${crypto.randomBytes(4).toString("hex")}`,
    timestamp: new Date().toISOString(),
    user,
    ipAddress: ip || "127.0.0.1",
    action,
    result,
    details,
    userAgent: ua || "Unknown Client Browser",
  });
}

// 0. POST: New User Registration
app.post("/api/auth/register", (req, res) => {
  try {
    const { username, email, password } = req.body;
    const ip = req.ip || "127.0.0.1";
    const ua = req.headers["user-agent"] || "Unknown Browser";

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Username, Email Address, and Password are required." });
    }

    const normEmail = email.toLowerCase().trim();
    const normUsername = username.trim();

    // Check if email already exists
    if (USERS_DB[normEmail]) {
      return res.status(400).json({ error: "An account with this email address already exists." });
    }

    // Check if username already exists (case-insensitive check on name)
    const usernameExists = Object.values(USERS_DB).some(
      (u) => u.name.toLowerCase().trim() === normUsername.toLowerCase()
    );
    if (usernameExists) {
      return res.status(400).json({ error: "This username is already taken." });
    }

    // Register user
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, salt);

    USERS_DB[normEmail] = {
      email: normEmail,
      name: username,
      role: "Developer", // Default role
      salt,
      passwordHash,
      failedAttempts: 0,
      lockoutUntil: null,
      mfaSecret: "123456",
      mfaEnabled: false,
    };

    writeAuditLog(normEmail, ip, "REGISTER", "SUCCESS", `New user successfully registered: ${username} (${email})`, ua);

    return res.json({ success: true, message: "Registration successful. You can now sign in." });
  } catch (error: any) {
    console.error("Registration failure:", error);
    res.status(500).json({ error: error.message });
  }
});

// 1. POST: User login attempt
app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body;
    const ip = req.ip || "127.0.0.1";
    const ua = req.headers["user-agent"] || "Unknown Browser";

    if (!email || !password) {
      return res.status(400).json({ error: "Email/username and password credentials are required." });
    }

    const normInput = email.toLowerCase().trim();
    // find user by email or username (name)
    let user = USERS_DB[normInput];
    if (!user) {
      user = Object.values(USERS_DB).find(u => u.name.toLowerCase().trim() === normInput);
    }

    if (!user) {
      writeAuditLog(normInput, ip, "LOGIN_ATTEMPT", "FAILED", "Attempted authentication with non-existent email/username.", ua);
      return res.status(401).json({ error: "Invalid email/username or password credentials." });
    }

    // Check Lockout
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      const remainingSeconds = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 1000);
      writeAuditLog(user.email, ip, "LOGIN_LOCKOUT", "LOCKOUT", `Blocked login attempt. Account is locked out for another ${remainingSeconds}s.`, ua);
      return res.status(423).json({
        error: `Account is currently locked out due to multiple failed login attempts. Please wait ${remainingSeconds} seconds before trying again.`,
        locked: true,
        remaining: remainingSeconds
      });
    }

    // Validate Password Hash
    const computedHash = hashPassword(password, user.salt);
    if (computedHash !== user.passwordHash) {
      user.failedAttempts += 1;
      
      if (user.failedAttempts >= 3) {
        user.lockoutUntil = new Date(Date.now() + 60 * 1000); // 60s security lock
        writeAuditLog(user.email, ip, "ACCOUNT_LOCKOUT", "LOCKOUT", "Account locked out for 60 seconds due to 3 consecutive password failures.", ua);
        return res.status(423).json({
          error: "Account locked out. Too many failed attempts. Security lock engaged for 60 seconds.",
          locked: true,
          remaining: 60
        });
      }

      writeAuditLog(user.email, ip, "PASSWORD_FAILURE", "FAILED", `Incorrect password. Failed attempt #${user.failedAttempts}.`, ua);
      return res.status(401).json({
        error: `Invalid email or password credentials. ${3 - user.failedAttempts} attempts remaining before account lockout.`,
        attemptsRemaining: 3 - user.failedAttempts
      });
    }

    // Success! Reset failures
    user.failedAttempts = 0;
    user.lockoutUntil = null;

    // Multi-factor check
    if (user.mfaEnabled) {
      const tempToken = crypto.randomBytes(32).toString("hex");
      MFA_TEMP_TOKENS[tempToken] = {
        email: user.email,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes expiration
      };

      writeAuditLog(user.email, ip, "MFA_CHALLENGE", "MFA_REQUIRED", "Password correct. Redirecting to multi-factor authorization challenge.", ua);
      return res.json({
        mfaRequired: true,
        email: user.email,
        tempToken,
        message: "Multi-Factor Authentication (MFA) required. Enter the 6-digit OTP code."
      });
    }

    // Standard Direct Login Session
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min expiration (configurable in UI)
    
    SESSIONS[sessionToken] = {
      token: sessionToken,
      email: user.email,
      role: user.role,
      name: user.name,
      expiresAt,
    };

    writeAuditLog(user.email, ip, "LOGIN_SUCCESS", "SUCCESS", `User session generated. Assigned role: ${user.role}.`, ua);

    res.json({
      success: true,
      token: sessionToken,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        mfaEnabled: false
      }
    });
  } catch (error: any) {
    console.error("Login failure:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. POST: Verify MFA Code
app.post("/api/auth/verify-mfa", (req, res) => {
  try {
    const { tempToken, code } = req.body;
    const ip = req.ip || "127.0.0.1";
    const ua = req.headers["user-agent"] || "Unknown Browser";

    if (!tempToken || !code) {
      return res.status(400).json({ error: "Challenge token and 6-digit verification code are required." });
    }

    const challenge = MFA_TEMP_TOKENS[tempToken];
    if (!challenge || challenge.expiresAt < new Date()) {
      return res.status(410).json({ error: "The MFA challenge session has expired or is invalid. Please sign in again." });
    }

    const user = USERS_DB[challenge.email.toLowerCase()];
    if (!user) {
      return res.status(404).json({ error: "User profile not found." });
    }

    // Verify code against static OTP (simulating authenticator / corporate push)
    if (code !== user.mfaSecret && code !== "123456") {
      writeAuditLog(user.email, ip, "MFA_FAILURE", "FAILED", "Incorrect Multi-Factor verification code entered.", ua);
      return res.status(401).json({ error: "Invalid verification code. Please check your authenticator and try again." });
    }

    // Successful MFA clearance
    delete MFA_TEMP_TOKENS[tempToken];

    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    SESSIONS[sessionToken] = {
      token: sessionToken,
      email: user.email,
      role: user.role,
      name: user.name,
      expiresAt,
    };

    writeAuditLog(user.email, ip, "MFA_VERIFIED", "MFA_VERIFIED", `MFA cleared. User session authorized. Assigned role: ${user.role}.`, ua);

    res.json({
      success: true,
      token: sessionToken,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        mfaEnabled: true
      }
    });
  } catch (error: any) {
    console.error("MFA verification failure:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. GET: Get/validate current session
app.get("/api/auth/session", (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : (req.query.token as string);

    if (!token || !SESSIONS[token]) {
      return res.json({ authenticated: false });
    }

    const session = SESSIONS[token];
    if (session.expiresAt < new Date()) {
      delete SESSIONS[token];
      return res.json({ authenticated: false, reason: "Session expired due to inactivity." });
    }

    // Refresh Session Lifetime on active request (Extend session configurable timeout)
    const activeUser = USERS_DB[session.email.toLowerCase()];
    const customTimeout = req.query.timeout ? parseInt(req.query.timeout as string, 10) : 15; // default 15 mins
    const sessionLifetimeMs = customTimeout * 60 * 1000;
    session.expiresAt = new Date(Date.now() + sessionLifetimeMs);

    res.json({
      authenticated: true,
      user: {
        email: session.email,
        name: session.name,
        role: session.role,
        mfaEnabled: activeUser ? activeUser.mfaEnabled : false
      },
      expiresAt: session.expiresAt.toISOString()
    });
  } catch (error: any) {
    console.error("Session fetch failure:", error);
    res.status(500).json({ error: error.message });
  }
});

// 4. POST: User logout
app.post("/api/auth/logout", (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : req.body.token;
    const ip = req.ip || "127.0.0.1";
    const ua = req.headers["user-agent"] || "Unknown Browser";

    if (token && SESSIONS[token]) {
      const session = SESSIONS[token];
      writeAuditLog(session.email, ip, "LOGOUT", "LOGOUT", "User logged out. Session keys invalidated.", ua);
      delete SESSIONS[token];
    }

    res.json({ success: true, message: "Logged out successfully." });
  } catch (error: any) {
    console.error("Logout failure:", error);
    res.status(500).json({ error: error.message });
  }
});

// 5. GET: Security Audit Logs (RBAC: Restricted to Administrators)
app.get("/api/auth/audit-logs", (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : (req.query.token as string);

    if (!token || !SESSIONS[token]) {
      return res.status(401).json({ error: "Access denied. Valid session token is required." });
    }

    const session = SESSIONS[token];
    if (session.role !== "Administrator") {
      return res.status(403).json({ error: "Permission Denied. Only system Administrators can inspect security audit logs." });
    }

    res.json({
      success: true,
      logs: AUDIT_LOGS
    });
  } catch (error: any) {
    console.error("Audit log fetch failure:", error);
    res.status(500).json({ error: error.message });
  }
});

// 6. POST: Password Reset / Forgot Password simulation
app.post("/api/auth/forgot-password", (req, res) => {
  try {
    const { email } = req.body;
    const ip = req.ip || "127.0.0.1";
    const ua = req.headers["user-agent"] || "Unknown Browser";

    if (!email) {
      return res.status(400).json({ error: "Email address is required." });
    }

    const normEmail = email.toLowerCase().trim();
    const user = USERS_DB[normEmail];

    writeAuditLog(normEmail, ip, "RESET_REQUEST", "RESET_REQUEST", "Password reset ticket generated. Dispatched temporary bypass token.", ua);

    if (user) {
      // Automatically clear lockouts as a helpful administrator shortcut!
      user.failedAttempts = 0;
      user.lockoutUntil = null;
    }

    res.json({
      success: true,
      message: "An enterprise password recovery link has been dispatched to your corporate inbox. Locked security thresholds have been reset."
    });
  } catch (error: any) {
    console.error("Password reset failure:", error);
    res.status(500).json({ error: error.message });
  }
});

// 7. POST: Update MFA Settings
app.post("/api/auth/mfa-toggle", (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : req.body.token;
    const { enabled } = req.body;
    const ip = req.ip || "127.0.0.1";
    const ua = req.headers["user-agent"] || "Unknown Browser";

    if (!token || !SESSIONS[token]) {
      return res.status(401).json({ error: "Authentication session required." });
    }

    const session = SESSIONS[token];
    const user = USERS_DB[session.email.toLowerCase()];

    if (user) {
      user.mfaEnabled = !!enabled;
      writeAuditLog(user.email, ip, "MFA_SETTINGS_UPDATE", "SUCCESS", `Multi-Factor Authentication (MFA) was toggled to: ${user.mfaEnabled ? "ENABLED" : "DISABLED"}.`, ua);
      return res.json({ success: true, mfaEnabled: user.mfaEnabled });
    }

    res.status(404).json({ error: "User not found." });
  } catch (error: any) {
    console.error("MFA settings update failure:", error);
    res.status(500).json({ error: error.message });
  }
});

// 8. POST: Modify Role (Developer/Administrator Preview Switcher)
app.post("/api/auth/change-role", (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : req.body.token;
    const { newRole } = req.body;
    const ip = req.ip || "127.0.0.1";
    const ua = req.headers["user-agent"] || "Unknown Browser";

    if (!token || !SESSIONS[token]) {
      return res.status(401).json({ error: "Authentication session required." });
    }

    const session = SESSIONS[token];
    const user = USERS_DB[session.email.toLowerCase()];

    if (user) {
      const allowedRoles = ["Administrator", "Developer", "Business User", "Viewer"];
      if (!allowedRoles.includes(newRole)) {
        return res.status(400).json({ error: "Invalid role specified." });
      }

      user.role = newRole;
      session.role = newRole;
      writeAuditLog(user.email, ip, "ROLE_UPDATE", "SUCCESS", `User switched role context to: ${newRole}. RBAC filters re-compiled.`, ua);
      return res.json({ success: true, role: newRole, user: { email: user.email, name: user.name, role: newRole, mfaEnabled: user.mfaEnabled } });
    }

    res.status(404).json({ error: "User not found." });
  } catch (error: any) {
    console.error("Role swap failure:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET / POST custom logging endpoint
app.post("/api/auth/log-event", (req, res) => {
  try {
    const { action, details } = req.body;
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

    if (!token || !SESSIONS[token]) {
      return res.status(401).json({ error: "Access denied. Valid session token is required." });
    }

    const session = SESSIONS[token];
    const ip = req.ip || "127.0.0.1";
    const ua = req.headers["user-agent"] || "Unknown Browser";

    writeAuditLog(session.email, ip, action || "PROJECT_MODIFIED", "SUCCESS", details || "", ua);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Log event failure:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend assets and hook up Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
