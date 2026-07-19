import { handlers } from "@/lib/auth";
import { authRateLimit } from "@/lib/request-guard";
import { NextRequest } from "next/server";

const { GET: originalGET, POST: originalPOST } = handlers;

export async function GET(req: NextRequest) {
  const limited = authRateLimit(req);
  if (limited) return limited;
  return originalGET(req);
}

export async function POST(req: NextRequest) {
  const limited = authRateLimit(req);
  if (limited) return limited;
  return originalPOST(req);
}
