import QRCode from "qrcode";
import { isShortCode, normalizeShortCode } from "@orgasport/engine";
import { qrTarget } from "@/lib/tournament/qr-target";

type Ctx = { params: Promise<{ code: string }> };

/**
 * QR code of the tournament link, as SVG (sharp at any print size).
 * `?cible=table` points to the scoring table instead (volunteer sheet): the
 * PIN is never part of the encoded address.
 */
export async function GET(request: Request, { params }: Ctx) {
  const { code: raw } = await params;
  const code = normalizeShortCode(raw);
  if (!isShortCode(code)) return new Response("Not found", { status: 404 });
  const target = qrTarget(code, new URL(request.url).searchParams.get("cible"));
  const svg = await QRCode.toString(target, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#0b1640", light: "#ffffff" } });
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
}

