export const getPublicErrorMessage = (
  _error: unknown,
  fallback = "Unable to complete your request. Please try again.",
  _nodeEnv = process.env.NODE_ENV,
) => fallback;
