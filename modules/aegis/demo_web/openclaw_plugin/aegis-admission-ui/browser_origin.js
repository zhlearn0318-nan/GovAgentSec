// Support both the OpenClaw opaque sandbox origin and direct same-origin pages.
// Arbitrary web origins must still fail before token or request processing.
export function isAllowedBrowserOrigin(req) {
  const origin = String(req.headers.origin ?? "");
  if (!origin || origin === "null") return true;
  try {
    const parsed = new URL(origin);
    return ["http:", "https:"].includes(parsed.protocol)
      && parsed.origin === origin
      && parsed.host.toLowerCase() === String(req.headers.host ?? "").toLowerCase();
  } catch {
    return false;
  }
}
