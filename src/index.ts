type PriceResponse = { price: number };

function isPriceResponse(x: unknown): x is PriceResponse {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { price?: unknown }).price === "number"
  );
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const date = url.searchParams.get("date"); // ISO timestamp
    const day = url.searchParams.get("day"); // YYYY-MM-DD

    // 1) Päivän hinnat (24h)
    if (day) {
      const [y, m, d] = day.split("-").map(Number);
      if (!y || !m || !d) {
        return new Response(JSON.stringify({ error: "Invalid day format" }), {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
        });
      }

      const prices: number[] = [];

      for (let h = 0; h < 24; h++) {
        // paikallinen aika -> UTC ISO
        const local = new Date(y, m - 1, d, h, 0, 0);
        const isoUtc = local.toISOString();

        const upstream =
          "https://api.porssisahko.net/v2/price.json?date=" +
          encodeURIComponent(isoUtc);

        const r = await fetch(upstream);
        const json: unknown = await r.json().catch(() => null);

        if (!r.ok || !isPriceResponse(json)) {
          return new Response(
            JSON.stringify({ error: "Failed to fetch day prices", hour: h }),
            {
              status: 502,
              headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
            }
          );
        }

        prices.push(json.price);
      }

      return new Response(JSON.stringify({ day, prices }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
      });
    }

    // 2) Yksittäinen hinta (vanha)
    if (!date) {
      return new Response(JSON.stringify({ error: "Missing date or day parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
      });
    }

    const upstream =
      "https://api.porssisahko.net/v2/price.json?date=" + encodeURIComponent(date);

    const r = await fetch(upstream);
    const body = await r.text();

    return new Response(body, {
      status: r.status,
      headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
    });
  },
};