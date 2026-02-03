// src/index.ts

export interface Env {
  FEEDBACK_KV: KVNamespace;
}

const ALLOWED_ORIGINS = new Set<string>([
  "https://lorzweq.github.io",
  "https://porssisahko-proxy.leevi-hanninen3.workers.dev",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://192.168.101.100:5500",
]);

// Premium keys stored server-side (not exposed to clients)
const PREMIUM_KEYS = new Set<string>([
  'PREM-8K9L-M3N7-Q2R5-X4W8',
  'PWAT-7H2J-F9D6-C5V1-B8N3',
  'ELEC-4T3Y-G8K2-P7M9-L6H5',
  'GOLD-9X2C-V5B7-N4M8-K3J6',
  'STAR-6L8H-J2K9-M5P3-R7T4',
  'LITE-3W5Y-B8N2-V6C9-X4Z7',
  'MEGA-2R9T-H5K7-J3M6-P8L4',
  'ULTR-7C4V-N8B2-M6K5-G9F3'
]);

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://lorzweq.github.io";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // --- PREMIUM KEY VALIDATION ---
    if (url.pathname === "/validate-premium") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, { status: 405, headers: cors });
      }

      let data: any = null;
      try {
        data = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: cors });
      }

      const key = typeof data?.key === "string" ? data.key.trim().toUpperCase() : "";
      const deviceId = typeof data?.deviceId === "string" ? data.deviceId : "";

      if (!key || !deviceId) {
        return json({ valid: false, error: "Key and deviceId required" }, { status: 400, headers: cors });
      }

      // Validate the premium key
      const isValid = PREMIUM_KEYS.has(key);

      if (isValid) {
        // Optional: Store activation in KV for tracking
        const activationKey = `premium:${deviceId}`;
        await env.FEEDBACK_KV.put(
          activationKey,
          JSON.stringify({ key, deviceId, activatedAt: new Date().toISOString() }),
          { expirationTtl: 60 * 60 * 24 * 365 } // 1 year
        );
      }

      return json({ valid: isValid }, { status: 200, headers: cors });
    }

    // --- FEEDBACK ---
    if (url.pathname === "/feedback") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, { status: 405, headers: cors });
      }

      let data: any = null;
      try {
        data = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: cors });
      }

      const name = typeof data?.name === "string" ? data.name.slice(0, 80) : "Nimetön";
      const rating = typeof data?.rating === "string" ? data.rating.slice(0, 20) : "ei annettu";
      const message = typeof data?.message === "string" ? data.message.slice(0, 2000) : "";
      const page = typeof data?.page === "string" ? data.page.slice(0, 300) : "";
      const ts = typeof data?.ts === "string" ? data.ts.slice(0, 80) : new Date().toISOString();

      if (!message.trim()) {
        return json({ ok: false, error: "Message required" }, { status: 400, headers: cors });
      }

      const key = `fb:${Date.now()}:${crypto.randomUUID()}`;
      console.log("SAVING FEEDBACK", key);

      await env.FEEDBACK_KV.put(
        key,
        JSON.stringify({ name, rating, message, page, ts, origin }),
        { expirationTtl: 60 * 60 * 24 * 90 } // 90 päivää
      );

      return json({ ok: true, key }, { status: 200, headers: cors });
    }

    // --- ELECTRICITY PRICE PROXY ---
    if (url.pathname === "/" || url.pathname === "") {
      if (request.method !== "GET") {
        return json({ ok: false, error: "Method not allowed" }, { status: 405, headers: cors });
      }

      const dateParam = url.searchParams.get("date");
      const latestParam = url.searchParams.get("latest");

      // Handle latest prices endpoint
      if (latestParam === "true") {
        try {
          const upstream = "https://api.porssisahko.net/v2/latest-prices.json";
          const response = await fetch(upstream);
          
          if (response.ok) {
            const data = await response.json();
            return json(
              data,
              { 
                status: 200, 
                headers: {
                  ...cors,
                  "Cache-Control": "max-age=3600",
                }
              }
            );
          } else {
            return json(
              { ok: false, error: "Failed to fetch latest prices from upstream" },
              { status: response.status, headers: cors }
            );
          }
        } catch (error) {
          console.error("Latest prices fetch error:", error);
          return json(
            { ok: false, error: "Failed to fetch latest prices", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500, headers: cors }
          );
        }
      }

      // jos ei annettu parametreja → näytä usage
      if (!dateParam) {
        return json(
          { 
            ok: true, 
            usage: "Use ?date=<ISO8601-timestamp> to get price in cents/kWh, or ?latest=true for 48-hour prices",
            example: "?date=2026-02-02T14:00:00.000Z or ?latest=true"
          },
          { status: 200, headers: cors }
        );
      }

      try {
        // Parse the requested date
        const requestedDate = new Date(dateParam);
        if (isNaN(requestedDate.getTime())) {
          return json(
            { ok: false, error: "Invalid date format. Use ISO 8601 format." },
            { status: 400, headers: cors }
          );
        }

        // Check if date is too far in the future (limit to ~2 days ahead to allow full tomorrow)
        const now = new Date();
        const maxFutureDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        if (requestedDate > maxFutureDate) {
          return json(
            { 
              ok: false,
              error: "No data yet",
              timestamp: requestedDate.toISOString(),
              note: "Data is not available for dates more than 2 days in the future"
            },
            { status: 400, headers: cors }
          );
        }

        const isoUtc = requestedDate.toISOString();
        const upstream = 
          "https://api.porssisahko.net/v2/price.json?date=" +
          encodeURIComponent(isoUtc);

        try {
          const response = await fetch(upstream);
          
          if (response.ok) {
            const data = await response.json() as any;
            
            // Extract price from response - handle multiple possible formats
            let priceInCents = null;
            if (typeof data?.price === 'number') {
              priceInCents = data.price;
            } else if (typeof data?.PriceWithTax === 'number') {
              priceInCents = data.PriceWithTax;
            } else if (Array.isArray(data) && data.length > 0 && typeof data[0]?.price === 'number') {
              // Handle array response
              priceInCents = data[0].price;
            }
            
            if (priceInCents !== null) {
              return json(
                { 
                  ok: true, 
                  price: priceInCents,
                  timestamp: requestedDate.toISOString(),
                  unit: "snt/kWh"
                },
                { status: 200, headers: cors }
              );
            }
          }
        } catch (apiError) {
          console.error("Upstream API error:", apiError);
        }

        // No data available from API
        return json(
          { 
            ok: false,
            error: "No data available",
            timestamp: requestedDate.toISOString(),
            note: "External API unavailable or no data available for this date"
          },
          { status: 404, headers: cors }
        );

      } catch (error) {
        console.error("Price fetch error:", error);
        return json(
          { 
            ok: false, 
            error: "Failed to fetch electricity price",
            details: error instanceof Error ? error.message : "Unknown error"
          },
          { status: 500, headers: cors }
        );
      }
    }

    return new Response("Not Found", { status: 404, headers: cors });
  },
};