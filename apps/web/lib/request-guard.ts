import { NextResponse } from "next/server";
import { MAX_REST_BODY_BYTES } from "@syncpad/shared";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown-ip"
  );
}

export async function readJsonWithLimit(req: Request, limitBytes = MAX_REST_BODY_BYTES) {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > limitBytes) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Request body too large" }, { status: 413 }),
    };
  }

  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > limitBytes) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Request body too large" }, { status: 413 }),
    };
  }

  if (!text.trim()) {
    return { ok: true as const, data: {} };
  }

  try {
    return { ok: true as const, data: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Malformed JSON" }, { status: 400 }),
    };
  }
}

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): NextResponse | null {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  existing.count += 1;
  if (existing.count <= options.limit) {
    return null;
  }

  const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    },
  );
}

export function mutationRateLimit(req: Request, userId: string): NextResponse | null {
  return rateLimit(`mutation:${userId}`, { limit: 120, windowMs: 60_000 });
}

export function authRateLimit(req: Request): NextResponse | null {
  return rateLimit(`auth:${clientIp(req)}`, { limit: 20, windowMs: 60_000 });
}
