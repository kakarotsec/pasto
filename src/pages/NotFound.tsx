import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center px-6">
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Page not found</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          This page doesn’t exist. Go back to Pasto to start a new link or open one with a code.
        </p>
        <a href="/" className="text-sm text-primary underline hover:text-primary/90">
          Back to Pasto
        </a>
      </div>
    </div>
  );
};

export default NotFound;
