import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MAX_FILE_BYTES, MAX_SHARE_SECONDS } from '#lib/limits.js';
import { limitSharing, saveTrace } from '#lib/server/shares.js';

export const POST: RequestHandler = async ({ request, url }) => {
	if (request.headers.get('origin') !== url.origin) error(403, 'Share from this website.');
	await limitSharing(request);
	if (!request.headers.get('content-type')?.startsWith('application/json'))
		error(415, 'Upload a JSON file.');
	if (Number(request.headers.get('content-length')) > MAX_FILE_BYTES)
		error(413, 'Files must be 10 MB or smaller.');
	const reader = request.body?.getReader();
	if (!reader) error(400, 'A trace file is required.');
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > MAX_FILE_BYTES) {
			await reader.cancel();
			error(413, 'Files must be 10 MB or smaller.');
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	const raw = new TextDecoder().decode(bytes);
	const requested = Number(url.searchParams.get('ttl') ?? MAX_SHARE_SECONDS);
	return json(await saveTrace(raw, requested), {
		status: 201,
		headers: { 'Cache-Control': 'no-store' }
	});
};
