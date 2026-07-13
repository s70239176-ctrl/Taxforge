/**
 * Structured, single-line JSON logging so every real agent call is
 * observable in Vercel/Render logs (grep-able by event, agentId, route,
 * status). Not a logging *service* — for real production volume, pipe
 * stdout to Datadog/Axiom/Better Stack; this just guarantees every log line
 * is structured from day one instead of ad-hoc console.log strings.
 */

type Level = "info" | "warn" | "error";

interface LogFields {
  level: Level;
  event: string;
  [key: string]: unknown;
}

export function logEvent(fields: LogFields): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...fields });
  if (fields.level === "error") console.error(line);
  else if (fields.level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Wraps a route handler body to log method/route/status/latency/agentId
 * automatically, plus catch-and-log any uncaught error as a 500 instead of
 * letting Next.js swallow it into a generic error page.
 */
export async function withRouteLogging<T>(
  route: string,
  req: Request,
  fn: () => Promise<Response>
): Promise<Response> {
  const start = Date.now();
  const agentId = req.headers.get("X-Agent-Id") ?? req.headers.get("x-forwarded-for") ?? "anonymous";
  try {
    const res = await fn();
    logEvent({
      level: res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info",
      event: "api_call",
      route,
      method: req.method,
      status: res.status,
      agentId,
      latencyMs: Date.now() - start,
    });
    return res;
  } catch (err) {
    logEvent({
      level: "error",
      event: "api_call_unhandled_error",
      route,
      method: req.method,
      agentId,
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return new Response(JSON.stringify({ error: "internal_error", message: "Unexpected server error." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
