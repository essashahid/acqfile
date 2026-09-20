import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
const sign = (deal: string, version: string, expires: number) =>
  createHmac("sha256", env().AUTH_SECRET).update(`${deal}:${version}:${expires}`).digest("hex");
export function sourceUrl(deal: string, version: string) {
  const expires = Math.floor(Date.now() / 1000) + 900;
  return `/staff/deals/${deal}/files/${version}/source?expires=${expires}&signature=${sign(deal, version, expires)}`;
}
export function validSourceUrl(url: URL, deal: string, version: string) {
  const expires = Number(url.searchParams.get("expires")),
    signature = url.searchParams.get("signature") ?? "";
  return (
    Number.isInteger(expires) &&
    expires >= Date.now() / 1000 &&
    expires < Date.now() / 1000 + 901 &&
    /^[a-f0-9]{64}$/.test(signature) &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(sign(deal, version, expires)))
  );
}

export function customerSourceUrl(deal: string, version: string) {
  return `/deals/${deal}/document/${version}?${sourceUrl(deal, version).split("?")[1]}`;
}
