import "./env";

export const config = {
  // JWT
  jwtSecret: getRequiredEnv("JWT_SECRET", "JWT secret is required. Generate one with: openssl rand -hex 64"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "24h",
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",

  // Admin credentials (must be set in .env)
  adminEmail: getRequiredEnv("ADMIN_EMAIL", "Admin email must be configured in .env"),
  adminPassword: getRequiredEnv("ADMIN_PASSWORD", "Admin password must be configured in .env"),
  adminName: process.env.ADMIN_NAME || "System Administrator",

  // Database
  dbHost: process.env.DB_HOST || process.env.MYSQL_HOST || "localhost",
  dbPort: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
  dbUser: process.env.DB_USER || process.env.MYSQL_USER || "root",
  dbPassword: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || "",
  dbName: process.env.DB_NAME || process.env.MYSQL_DATABASE || "ustp_alumni",
  dbSslCa: process.env.DB_SSL_CA || process.env.MYSQL_SSL_CA,
  dbSslCaFile: process.env.DB_SSL_CA_FILE || process.env.MYSQL_SSL_CA_FILE,
  dbSsl: process.env.DB_SSL || process.env.MYSQL_SSL || process.env.MYSQL_SSL_REQUIRED,

  // Email (Brevo/Sendinblue)
  brevoApiKey: process.env.BREVO_API_KEY,
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL,
  brevoSenderName: process.env.BREVO_SENDER_NAME,

  // SMTP fallback
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,

  // Application
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || "development",
  appBaseUrl: process.env.APP_BASE_URL || "",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",

  // Institution
  institutionName: process.env.INSTITUTION_NAME || "Your Institution",
  institutionAcronym: process.env.INSTITUTION_ACRONYM || "",

  // Security
  corsAllowAll: process.env.CORS_ALLOW_ALL === "true",
  allowedOrigins: parseCsvEnv(process.env.ALLOWED_ORIGINS),

  // Feature flags
  queueProcessingEnabled: process.env.QUEUE_PROCESSING_ENABLED !== "false",
  autoArchiveEnabled: process.env.AUTO_ARCHIVE_ENABLED !== "false",
  runtimeSchemaSyncEnabled: process.env.RUNTIME_SCHEMA_SYNC !== "false",
  resetAdminPasswordOnStartup: process.env.RESET_ADMIN_PASSWORD_ON_STARTUP === "true",
};


function getRequiredEnv(name: string, message: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}\n\n${message}\n\n` +
      `Please set ${name} in your .env file (see .env.example for reference).`
    );
  }
  return value.trim();
}


function parseCsvEnv(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}


export const DEFAULT_LOCAL_FRONTEND_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];


export const TRACER_TABLE_NAMES = ["tracer_form", "graduate_tracer", "tracer_responses"] as const;


export const ANNOUNCEMENT_TABLE_NAMES = ["announcements", "events"] as const;
