const messageFromUnknown = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown error";

export const getPublicErrorMessage = (
  error: unknown,
  fallback = "Internal server error",
  nodeEnv = process.env.NODE_ENV,
) => nodeEnv === "production" ? fallback : messageFromUnknown(error);

