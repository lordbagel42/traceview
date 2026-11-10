# Traceview

A local-first, single-trace viewer at **https://traceview.raygen.dev**. Open an OpenTelemetry, Jaeger, or Axiom JSON export. No account, collector, or database setup.

## Inspect

- Tree-aligned waterfall with collapse, search across names/IDs/attributes, service and error filters, duration/self-time sorting, and span-range zoom.
- Span attributes, events, links, parent navigation, and original JSON download.
- Wall-clock duration, errors, service totals, and deterministic findings linked to their evidence. Summed span time is explicitly distinguished from wall time; findings are not causal diagnoses.
- `/` focuses search, arrow keys move between spans, Escape clears selection/zoom, and Ctrl/Cmd+O opens a file.

Supports one trace per file, up to 10 MB and 10,000 spans. Missing parents and inconsistent timing are surfaced rather than hidden. Self time subtracts the union of overlapping direct-child intervals. Epoch timestamps use JavaScript-number precision; sub-microsecond positioning may round at modern epoch values.

## Privacy and retention

Opening a file parses it entirely in the browser. No trace is sent until **Share trace → Upload & create link**. Sharing uploads the original file, including any secrets, personal content, attributes, and metadata it contains. Links are unlisted, not authenticated: anyone with the URL can read the trace.

Choose **1 hour, 1 day, or 3 days**. Cloudflare KV expires the object automatically; the API additionally refuses reads at the recorded deadline and responses are not cached. Expiry cannot revoke copies already downloaded or retained in an open browser. Sharing is limited to 10 requests per minute per IP at each Cloudflare location.

## Amp feedback

Open `https://traceview.raygen.dev/?amp` to show Amp’s feedback widget. Select an element, describe the change, and send it to start an Amp thread in the workspace project. Sending feedback requires an Amp account with project access; this is not an anonymous bug-report form.

The official widget script loads from `ampcode.com` on every page, but its button stays hidden until enabled with `?amp` or the widget shortcut. Feedback you submit can include selected page content, so avoid selecting sensitive trace data. Widget configuration lives in Amp’s project settings, with only `https://traceview.raygen.dev` allowed; do not add orb portal origins.

## Development

Requires Node.js 22+ and pnpm.

```sh
pnpm install
pnpm dev
```

To exercise the exact Worker runtime and local KV bindings:

```sh
pnpm build
pnpm preview
```

Checks: `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`. Format with `pnpm format`.

## Deployment

`wrangler.jsonc` declares the Worker, assets, custom domain, KV namespace, and rate limiter. Use the existing Cloudflare credential mechanism; never commit secrets. `pnpm deploy` builds and deploys to the configured account/domain. Deploying this configuration changes the live site.

Built with SvelteKit, Svelte 5, shadcn-svelte, Tailwind CSS, Lucide, and locally hosted Geist fonts. No AI inference, third-party analytics, or remote font requests.
