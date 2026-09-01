const isDevelopment = import.meta.env.DEV;

export const clientLogger = {
  debug: (...args: unknown[]) => {
    if (isDevelopment) console.debug("[DEBUG]", ...args);
  },
  error: (...args: unknown[]) => {
    if (isDevelopment) console.error("[ERROR]", ...args);
  },
};

