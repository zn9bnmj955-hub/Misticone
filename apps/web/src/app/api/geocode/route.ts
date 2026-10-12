import { NextResponse, type NextRequest } from "next/server";
import { geocode } from "@/lib/geocode";

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  const kind = request.nextUrl.searchParams.get("kind") === "address" ? "address" : "city";
  if (q.length < 3) return NextResponse.json({ places: [] });
  try {
    const places = await geocode(q, kind, AbortSignal.timeout(3500));
    return NextResponse.json({ places }, { headers: { "cache-control": "public, max-age=86400" } });
  } catch {
    return NextResponse.json({ places: [], unavailable: true }, { status: 503 });
  }
}
