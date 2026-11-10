// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace Cloudflare {
		interface Env {
			BUG_REPORT_WEBHOOK?: string;
		}
	}
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// Cloudflare bindings are imported from cloudflare:workers.
	}
}

export {};
