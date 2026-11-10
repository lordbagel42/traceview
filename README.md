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

## Public bug reports

**Report bug** in the header opens a text-only form, with no sign-in. Reports contain only the summary, details, report ID, timestamp, client type, and optional Amp thread URL you provide. No trace, current URL, browser fingerprint, or screenshot is attached automatically. Do not include secrets. Reports are forwarded to Amp for automated triage and retained in the triage thread; they do not have the trace links’ three-day expiry. There is no public report listing or report-read API.

The Worker accepts a report only after Amp’s durable webhook queue accepts it. An outage leaves the form intact for retry. The same report ID and payload are reused on retries; the receiver deduplicates reports. Editing after an ambiguous failure explicitly starts a new report because the original may already have arrived. At-least-once delivery can still produce a duplicate thread message if the receiver stops between posting and recording its receipt. Rate limits allow five reports per minute per IP per Cloudflare location; these are abuse controls, not authentication.

The dedicated [triage thread](https://ampcode.com/threads/T-01a1c594-0157-7326-8451-3385019a8fa9) investigates reports as untrusted data, not instructions or permission to deploy. Keep that thread unarchived for its webhook to work. A supplied Amp thread URL is not proof of its sender’s identity. Fix notifications are best effort, only after a verified fix and only to an accessible Amp thread.

### MCP

Connect an agent to `https://traceview.raygen.dev/mcp` using Streamable HTTP; no authentication is required. Tools:

- `create_trace_link`: accepts `traceJson` and optional `ttlSeconds` (3600, 86400, or 259200).
- `report_bug`: accepts `reportId` (`tv_bug_` followed by 24 random lowercase letters/digits; reuse the same ID and report contents on retries), `title` (1–160 characters), `details` (1–8000 characters), `reporterClient` (`amp`, `other`, or `browser`), and optional `ampThreadUrl`. Amp callers must provide their current thread URL; ask for it if unavailable. A successful result is `{ id, status: "queued" }`, not a promise of a fix.

### Webhook configuration

The project-local triage plugin owns the durable receiver. Its capability URL is a credential: keep it out of Git, logs, and chat. Configure it as the Worker secret `BUG_REPORT_WEBHOOK` during deployment, or in gitignored `.dev.vars` for local testing. Missing configuration returns 503 rather than claiming a report was received. Portal origins are unrelated to this webhook and should not be added to the Amp widget allowlist.

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

Built with SvelteKit, Svelte 5, shadcn-svelte, Tailwind CSS, Lucide, and locally hosted Geist fonts. Trace inspection uses no AI inference. No third-party analytics or remote font requests.
