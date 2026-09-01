import dotenv from "dotenv";
import path from "node:path";

const serverRoot = path.resolve(import.meta.dirname, "..");
const projectRoot = path.resolve(serverRoot, "..");

dotenv.config({ path: path.resolve(projectRoot, ".env") });
dotenv.config({ path: path.resolve(serverRoot, ".env"), override: true });

const required = [
  "JWT_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_NAME",
];

const placeholderPatterns = [
  /^change-this/i,
  /^replace-with/i,
  /^your-/i,
  /^admin@example\./i,
];

const missing = required.filter((name) => !String(process.env[name] || "").trim());
const placeholders = required.filter((name) => {
  const value = String(process.env[name] || "").trim();
  return value && placeholderPatterns.some((pattern) => pattern.test(value));
});
const weak = required.filter((name) => {
  const value = String(process.env[name] || "").trim();

  if (!value) return false;
  if (name === "JWT_SECRET") return value.length < 32;
  if (name === "ADMIN_PASSWORD") return value.length < 12;
  return false;
});

if (missing.length || placeholders.length || weak.length) {
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (placeholders.length) {
    console.error(`Replace placeholder/weak environment values: ${placeholders.join(", ")}`);
  }

  if (weak.length) {
    console.error(`Strength check failed for environment values: ${weak.join(", ")}`);
  }

  process.exitCode = 1;
} else {
  console.log("Required runtime environment variables are present and do not match known placeholders.");
}
