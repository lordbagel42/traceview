import { error, json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(params.id))
		error(404, 'Trace not found.');
	if (!env.TRACES) error(503, 'Sharing is temporarily unavailable.');
	const saved = await env.TRACES.get<{ raw: string; expiresAt: number }>(params.id, 'json');
	if (!saved || saved.expiresAt <= Date.now())
		error(404, 'This trace has expired or does not exist. Open a local file to continue.');
	return json(saved, {
		headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
	});
};
