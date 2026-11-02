import { serve } from "bun";
import index from "./index.html";

const PORT = Number(process.env.PORT ?? 5173);
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:3000";

// Bun's CSS bundler base64-inlines any font reached through url(), which put
// ~225KB of Airbnb Cereal into the render-blocking stylesheet and downloaded
// every weight whether the page used it or not. Serving them as real files
// keeps the CSS small and lets font-display:swap do its job. A whitelist, not
// a path join, so the route can't be walked out of the assets directory.
const FONTS = new Set([
  "AirbnbCereal_W_Bk.otf",
  "AirbnbCereal_W_Md.otf",
  "AirbnbCereal_W_Bd.otf",
  "LakoviesCaleste-Regular.otf",
]);

const server = serve({
  port: PORT,
  routes: {
    // Same-origin proxy to the Express backend. Keeps cookies/auth simple and
    // avoids a CORS preflight on every authed request.
    "/api/*": async (req: Request) => {
      const url = new URL(req.url);
      const headers = new Headers(req.headers);
      headers.delete("host");
      // Overwrite, never forward: a client-supplied XFF is how a client spoofs
      // its IP past the backend's per-ip rate limiter.
      headers.set("x-forwarded-for", server.requestIP(req)?.address ?? "");

      let upstream: Response;
      try {
        upstream = await fetch(`${BACKEND}${url.pathname}${url.search}`, {
          method: req.method,
          headers,
          body: req.body,
          redirect: "manual",
          // @ts-expect-error - required when body is a stream
          duplex: "half",
        });
      } catch {
        return Response.json(
          { error: "backend_unreachable", message: "The API is not running." },
          { status: 502 },
        );
      }

      // Bun's fetch already decoded the body; re-sending these corrupts it.
      const out = new Headers(upstream.headers);
      out.delete("content-encoding");
      out.delete("content-length");
      return new Response(upstream.body, { status: upstream.status, headers: out });
    },

    "/fonts/:file": (req: Bun.BunRequest<"/fonts/:file">) => {
      if (!FONTS.has(req.params.file)) return new Response(null, { status: 404 });
      return new Response(Bun.file(`${import.meta.dir}/assets/${req.params.file}`), {
        headers: {
          "content-type": "font/otf",
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    },

    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
});

console.log(`RetroMobi running at ${server.url} (api -> ${BACKEND})`);
