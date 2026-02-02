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

      // jos ei annettu parametreja → näytä usage
      if (!dateParam) {
        return json(
          { 
            ok: true, 
            usage: "Use ?date=<ISO8601-timestamp> to get price in cents/kWh",
            example: "?date=2026-02-02T14:00:00.000Z"
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

        const isoUtc = requestedDate.toISOString();
        const upstream = 
          "https://api.porssisahko.net/v2/price.json?date=" +
          encodeURIComponent(isoUtc);

        try {
          const response = await fetch(upstream);
          
          if (response.ok) {
            const data = await response.json() as any;
            
            // Extract price from response
            const priceInCents = typeof data?.price === 'number' 
              ? data.price 
              : (typeof data?.PriceWithTax === 'number' ? data.PriceWithTax : null);
            
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

        // Fallback: return estimated price with variation based on hour
        // Typical Finnish pricing: cheaper at night (2-6), expensive during day (10-18)
        const hour = requestedDate.getUTCHours();
        let estimatedPrice = 5.0;
        if (hour >= 6 && hour <= 9) estimatedPrice = 8.5;
        else if (hour >= 10 && hour <= 17) estimatedPrice = 12.0;
        else if (hour >= 18 && hour <= 20) estimatedPrice = 9.5;
        else if (hour >= 21 && hour <= 23) estimatedPrice = 6.5;
        
        return json(
          { 
            ok: true, 
            price: estimatedPrice,
            timestamp: requestedDate.toISOString(),
            unit: "snt/kWh",
            note: "Using estimated price - external API unavailable"
          },
          { status: 200, headers: cors }
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