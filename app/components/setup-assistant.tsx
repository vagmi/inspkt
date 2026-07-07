import {
  UraiChatWidget,
  type WidgetVars,
} from "@uraiai/chat-widget-react";
import { X } from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router";
import type { UraiConfig } from "~/lib/urai.server";
import { cn } from "~/lib/utils";

/** Refresh the widget token this many seconds before it expires. */
const REFRESH_LEAD_SECONDS = 60;

// The inline widget defaults to a fixed panel size (`--ucw-w` 380px /
// `--ucw-h` 560px). Override those vars so the chat panel fills our flyout.
// Height is viewport-relative (`100vh`) rather than `100%`: a percentage
// collapses to content height wherever the widget's internal wrapper chain
// isn't explicitly sized, leaving a gap below the input bar.
const WIDGET_STYLE = {
  height: "100vh",
  width: "100%",
  "--ucw-w": "100%",
  "--ucw-h": "100vh",
} as CSSProperties;

/**
 * Right-hand vertical flyout that embeds the Urai setup assistant app-wide.
 * The assistant's UraiJS tools call our API with the short-lived `inspkt_token`
 * we pass through `vars`; we refetch it from `/app/urai-token` before it
 * expires. Tool-driven `navigate` commands move the app via react-router.
 *
 * Controlled by the layout (which owns the "Inspkt AI" header toggle and
 * shifts the main content left while open). Only mounted for `can.setup`
 * members (the layout gates it).
 */
export function SetupAssistant({
  config,
  open,
  onClose,
}: {
  config: UraiConfig;
  open: boolean;
  onClose: () => void;
}) {
  const [token, setToken] = useState(config.token);
  const [exp, setExp] = useState(config.exp);
  const location = useLocation();
  const navigate = useNavigate();

  // Context handed to the assistant; deep-compared by the widget, so a fresh
  // object each render is fine. The UraiJS tools read auth + org from
  // `meta.vars.metadata` (the `_widget_token` is our short-lived signed token;
  // orgId is also baked into that token, so this is non-authoritative). The
  // API base the tools call is the Urai-side `URAI_API_HOST` secret.
  const vars = useMemo<WidgetVars>(
    () => ({
      metadata: { _widget_token: token, org_id: config.orgId },
      route: location.pathname,
    }),
    [token, config.orgId, location.pathname],
  );

  // Keep the token alive: schedule a refetch shortly before expiry.
  useEffect(() => {
    const nowSeconds = Date.now() / 1000;
    const delayMs = Math.max(exp - nowSeconds - REFRESH_LEAD_SECONDS, 5) * 1000;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/app/urai-token");
        if (!res.ok) return;
        const next = (await res.json()) as { token: string; exp: number };
        if (!cancelled) {
          setToken(next.token);
          setExp(next.exp);
        }
      } catch {
        // Network hiccup — the next render's effect reschedules from `exp`.
      }
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [exp]);

  // A uraiJS tool signalled the host page via meta.urai.sendCommand. Untrusted —
  // validate the shape ({ type:"navigate", payload:{ path } }) before acting,
  // and only follow in-app paths. (Tool-call progress is shown by the widget
  // itself via native tool traces, so we don't handle that here.)
  const onCommand = useCallback(
    (command: unknown) => {
      if (!command || typeof command !== "object") return;
      const cmd = command as { type?: unknown; payload?: { path?: unknown } };
      if (
        cmd.type === "navigate" &&
        typeof cmd.payload?.path === "string" &&
        cmd.payload.path.startsWith("/app")
      ) {
        navigate(cmd.payload.path);
      }
    },
    [navigate],
  );

  return (
    <>
      {/* Backdrop on small screens so the overlay panel feels modal. (On
          larger screens the layout reserves space, so no backdrop is needed.) */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/20 transition-opacity sm:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden
      />

      {/* Panel width here must match the layout's reserved margin (sm:mr-[380px]). */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-screen w-full flex-col border-l bg-card shadow-xl transition-transform duration-300 sm:w-[380px]",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!open}
      >
        {/* The widget renders its own header, so we don't add one here (avoids a
            double header). The close button floats just outside the panel's left
            edge, vertically centered in the viewport. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Inspkt AI"
          className={cn(
            "absolute left-0 top-1/2 z-10 flex size-9 -translate-x-full -translate-y-1/2 items-center justify-center rounded-l-full border border-r-0 bg-card text-muted-foreground shadow-md transition-colors hover:text-foreground",
            open ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <X className="size-5" />
        </button>
        <div className="min-h-0 flex-1">
          <UraiChatWidget
            mode="inline"
            baseUrl={config.chatBase}
            widgetToken={config.widgetToken}
            userId={config.userId}
            vars={vars}
            onCommand={onCommand}
            style={WIDGET_STYLE}
          />
        </div>
      </aside>
    </>
  );
}
