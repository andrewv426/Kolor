import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Daily-photo variants served from /public/photo/<id>/* in local mode:
        // master16.png, master16-hi.webp, master16-lo.webp, preview8.webp,
        // ai768.jpg, manifest.json. Each path holds frozen, pre-staged bytes
        // that never change once staged (PRD §6.8 / invariant #6), so caching
        // forever and skipping Vercel's default revalidation round-trip
        // (max-age=0, must-revalidate) is safe AND eliminates the per-load 304
        // on the ~7.8 MB two-plane master.
        //
        // SAFETY INVARIANT (load-bearing): filenames are fixed-per-variant and
        // reused across every /photo/<id>/ dir — they are NOT content-hashed, so
        // `immutable` is correct ONLY because a given path's bytes are frozen
        // once shipped. A re-stage MUST therefore use a NEW id (dev-0NN) / a new
        // daily_photos row; never overwrite a shipped /photo/<id>/<file>.
        //
        // Scope note: this only covers same-origin /public assets. Production
        // photos come from Supabase Storage (different origin) — their cache
        // headers must be set via `cacheControl` at upload in
        // scripts/prepare-master / the pre-stage workflow (Supabase default is
        // only max-age=3600); this rule does not affect them.
        source: "/photo/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
