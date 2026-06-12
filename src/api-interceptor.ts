// src/api-interceptor.ts

const PRE_URL = "https://ais-pre-b7hbsymvjz46yaiaof42gv-893408826438.europe-west2.run.app";
const DEV_URL = "https://ais-dev-b7hbsymvjz46yaiaof42gv-893408826438.europe-west2.run.app";

let activeBackendUrl = PRE_URL; // Default to pre-view production backend

if (typeof window !== "undefined") {
  const isCloudRun = window.location.hostname.endsWith(".run.app");
  const isLocalhost = window.location.hostname === "localhost" || 
                       window.location.hostname === "127.0.0.1" || 
                       window.location.hostname.startsWith("192.168.");

  if (!isCloudRun && !isLocalhost) {
    console.log("[Ilivik Hub] Custom domain detected. Intercepting and routing API requests.");
    
    const originalFetch = window.fetch;

    // Detect responsive backend server dynamically
    const selectActiveBackend = async () => {
      const candidates = [PRE_URL, DEV_URL];
      for (const candidate of candidates) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);
          
          const res = await originalFetch(candidate + "/api/health", { 
            method: "GET",
            signal: controller.signal,
            headers: { "Accept": "application/json" }
          });
          
          clearTimeout(timeoutId);
          if (res.ok) {
            activeBackendUrl = candidate;
            console.log("[Ilivik Hub] Dynamic Backend Selection: Connected successfully to active endpoint:", candidate);
            return;
          }
        } catch (e) {
          console.warn(`[Ilivik Hub] Endpoint check failed for ${candidate}:`, e);
        }
      }
      console.warn("[Ilivik Hub] No backend endpoints responded to connection validation. Using default fallback:", activeBackendUrl);
    };

    selectActiveBackend();

    // Intercept standard fetch operations
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
        const rewrittenUrl = activeBackendUrl + urlStr;
        console.log(`[Ilivik Hub] Proxying API call to active server: ${rewrittenUrl}`);
        
        if (typeof input === "string") {
          return originalFetch(rewrittenUrl, init);
        } else if (input instanceof URL) {
          return originalFetch(new URL(rewrittenUrl), init);
        } else {
          try {
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
