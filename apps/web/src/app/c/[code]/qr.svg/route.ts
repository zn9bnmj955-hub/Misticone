import QRCode from "qrcode";
import { isShortCode, normalizeShortCode } from "@orgasport/engine";
import { env } from "@/lib/env";

type Ctx = { params: Promise<{ code: string }> };

/** QR code of the tournament link, as SVG (sharp at any print size). */
export async function GET(_request: Request, { params }: Ctx) {
  const { code: raw } = await params;
  const code = normalizeShortCode(raw);
  if (!isShortCode(code)) return new Response("Not found", { status: 404 });
  const svg = await QRCode.toString(`${env.siteUrl}/c/${code}`, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#0b1640", light: "#ffffff" } });
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
}
