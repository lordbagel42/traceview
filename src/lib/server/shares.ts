import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { MAX_FILE_BYTES, MAX_SHARE_SECONDS } from '#lib/limits.js';
import { parseTrace } from '#lib/trace.js';

export async function limitSharing(request: Request) {
	const allowed = await env.SHARE_LIMITER.limit({
		key: request.headers.get('cf-connecting-ip') ?? 'local'
	});
	if (!allowed.success) error(429, 'Too many requests. Try again in a minute.');
}

export async function saveTrace(raw: string, ttl: number) {
	if (!env.TRACES) error(503, 'Sharing is temporarily unavailable.');
	if (new TextEncoder().encode(raw).byteLength > MAX_FILE_BYTES)
		error(413, 'Files must be 10 MB or smaller.');
	if (![3600, 86400, MAX_SHARE_SECONDS].includes(ttl))
		error(400, 'Choose 1 hour, 1 day, or 3 days.');
	try {
		parseTrace(JSON.parse(raw));
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Invalid trace JSON.');
	}
	const id = crypto.randomUUID();
	const expiresAt = Date.now() + ttl * 1000;
	await env.TRACES.put(id, JSON.stringify({ raw, expiresAt }), { expirationTtl: ttl });
	return { id, expiresAt };
}
