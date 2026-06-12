// src/api-interceptor.ts
const BACKEND_URL = "https://ais-pre-b7hbsymvjz46yaiaof42gv-893408826438.europe-west2.run.app";

if (typeof window !== "undefined") {
  const isCloudRun = window.location.hostname.endsWith(".run.app");
  const isLocalhost = window.location.hostname === "localhost" || 
                       window.location.hostname === "127.0.0.1" || 
                       window.location.hostname.startsWith("192.168.");

  if (!isCloudRun && !isLocalhost) {
    console.log("[Ilivik Hub] Custom domain detected. Intercepting and routing API requests to Cloud Run backend:", BACKEND_URL);
    const originalFetch = window.fetch;
    
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      let urlStr = "";
      if (typeof input === "string") {
        urlStr = input;
      } else if (input instanceof URL) {
        urlStr = input.toString();
      } else if (input && typeof input === "object" && "url" in input) {
        urlStr = (input as any).url;
      }

      if (urlStr.startsWith("/api/")) {
        const rewrittenUrl = BACKEND_URL + urlStr;
        if (typeof input === "string") {
          return originalFetch(rewrittenUrl, init);
        } else if (input instanceof URL) {
          return originalFetch(new URL(rewrittenUrl), init);
        } else {
          try {
            // Recreate fetch request for standard Request object if passed
            const headers = init?.headers || (input as Request).headers;
            const method = init?.method || (input as Request).method;
            const body = init?.body || (input as any).body;
            return originalFetch(rewrittenUrl, { ...init, headers, method, body });
          } catch (e) {
            return originalFetch(rewrittenUrl, init);
          }
        }
      }
      return originalFetch(input, init);
    };
  }
}
export {};
