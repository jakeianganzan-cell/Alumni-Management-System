import { clientLogger } from "@/lib/logger";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    clientLogger.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4 py-8">
      <div className="max-w-sm text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-primary underline hover:bg-primary/5 hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
