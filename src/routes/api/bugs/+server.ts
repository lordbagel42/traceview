import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from 'cloudflare:workers';
import { submitBug } from '#lib/server/bugs.js';

export const POST: RequestHandler = async ({ request, url }) => {
	if (request.headers.get('origin') !== url.origin) error(403, 'Report bugs from this website.');
	const allowed = await env.BUG_LIMITER.limit({
		key: request.headers.get('cf-connecting-ip') ?? 'local'
	});
	if (!allowed.success) error(429, 'Too many reports. Please try again in a minute.');
	if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
		error(415, 'Send a JSON report.');
	const reader = request.body?.getReader();
	if (!reader) error(400, 'A report is required.');
	let text = '';
	let size = 0;
	const decoder = new TextDecoder();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > 48 * 1024) {
			await reader.cancel();
			error(413, 'Report is too large.');
		}
		text += decoder.decode(value, { stream: true });
	}
	text += decoder.decode();
	let input: unknown;
	try {
		input = JSON.parse(text);
	} catch {
		error(400, 'Invalid JSON report.');
	}
	return json(await submitBug(input), { status: 202, headers: { 'Cache-Control': 'no-store' } });
};
