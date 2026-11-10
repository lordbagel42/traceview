# Traceview

## Platform

Web.

## Stack

SvelteKit, shadcn-svelte, Cloudflare Workers. Requested deployment: traceview.raygen.dev.

## Purpose

Load a single trace from OTLP, Axiom trace JSON, or Jaeger JSON and immediately inspect it. No account, telemetry pipeline, or dashboard setup. The supplied screenshot pins a dense, dark, restrained observability-tool design language.

## Contract

Local files stay in the browser until sharing is explicitly requested. A user may publish an unlisted link for at most three days; storage expires automatically. The viewer exposes timing metrics, deterministic findings, and interactive span inspection. Uploaded trace text is untrusted and is never rendered as HTML. Do not bundle the user's private example files.

## Implementation assumptions

Unlisted links are readable by anyone holding the URL, not authenticated private storage. Maximum file size is 10 MB and maximum span count is 10,000. Multi-trace files are rejected rather than silently combining unrelated traces.
