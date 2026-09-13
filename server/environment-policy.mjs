const VALID_ENVIRONMENTS = new Set(["development", "test", "staging", "production"]);
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SAFE_AUTOMATED_TEST_DATABASE_PATTERN = /_(?:test|ci|staging)$/i;

const normalizeEnvironment = (value) => String(value || "").trim().toLowerCase();

export const getApplicationEnvironment = (env = process.env) => {
  const explicitEnvironment = normalizeEnvironment(env.APP_ENV);
  const nodeEnvironment = normalizeEnvironment(env.NODE_ENV);
  const applicationEnvironment =
    explicitEnvironment || (nodeEnvironment === "production" ? "production" : nodeEnvironment === "test" ? "test" : "development");

  if (!VALID_ENVIRONMENTS.has(applicationEnvironment)) {
    throw new Error("APP_ENV must be development, test, staging, or production.");
  }

  return applicationEnvironment;
};

export const assertDatabaseEnvironment = (env = process.env) => {
  const applicationEnvironment = getApplicationEnvironment(env);
  const explicitApplicationEnvironment = normalizeEnvironment(env.APP_ENV);
  const databaseEnvironment = normalizeEnvironment(env.DB_ENVIRONMENT);
  const databaseHost = String(env.DB_HOST || env.MYSQL_HOST || "localhost").trim().toLowerCase();
  const databaseName = String(env.DB_NAME || env.MYSQL_DATABASE || "ustp_alumni").trim();

  if (databaseEnvironment && !VALID_ENVIRONMENTS.has(databaseEnvironment)) {
    throw new Error("DB_ENVIRONMENT must be development, test, staging, or production.");
  }

  if (explicitApplicationEnvironment && applicationEnvironment !== "development" && !databaseEnvironment) {
    throw new Error("DB_ENVIRONMENT is required when APP_ENV is staging or production.");
  }

  if (databaseEnvironment && databaseEnvironment !== applicationEnvironment) {
    throw new Error(
      `Database environment mismatch: APP_ENV is ${applicationEnvironment}, but DB_ENVIRONMENT is ${databaseEnvironment}.`,
    );
  }

  if (applicationEnvironment === "production" && LOCAL_DATABASE_HOSTS.has(databaseHost)) {
    throw new Error("Production cannot use a local database host.");
  }

  if (
    (normalizeEnvironment(env.NODE_ENV) === "test" || applicationEnvironment === "test")
    && !SAFE_AUTOMATED_TEST_DATABASE_PATTERN.test(databaseName)
  ) {
    throw new Error("Unsafe test database detected. Automated tests cannot use the production database.");
  }

  return applicationEnvironment;
};

export const assertNonProductionOperation = (operation, env = process.env) => {
  const applicationEnvironment = assertDatabaseEnvironment(env);
  if (applicationEnvironment === "production") {
    throw new Error(`${operation} is disabled in production.`);
  }
  return applicationEnvironment;
};
