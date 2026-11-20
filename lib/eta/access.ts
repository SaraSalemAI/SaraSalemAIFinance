import { timingSafeEqual } from "node:crypto";

/**
 * The ETA route spends the server's ETA credentials, so a caller must present the ETA_ACCESS_KEY the
 * server was given (x-eta-access-key header). With no key configured nobody is let through.
 */
export function etaAuthorised(req: Request, key = process.env.ETA_ACCESS_KEY ?? ""): boolean {
  const given = req.headers.get("x-eta-access-key") ?? "";
  if (!key || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}
