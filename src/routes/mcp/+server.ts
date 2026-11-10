import { error, isHttpError } from '@sveltejs/kit';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { MAX_FILE_BYTES, MAX_SHARE_SECONDS } from '#lib/limits.js';
import { limitSharing, saveTrace } from '#lib/server/shares.js';
import { bugReportSchema, submitBug } from '#lib/server/bugs.js';
import { env } from 'cloudflare:workers';

export const POST: RequestHandler = async ({ request, url }) => {
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) error(403, 'Cross-origin requests are not allowed.');
	await limitSharing(request);
	const server = new McpServer(
		{ name: 'traceview', version: '1.0.0' },
		{
			instructions:
				'Create temporary viewer links for one OpenTelemetry, Jaeger, or Axiom JSON trace. Upload only with the user’s permission: anyone holding the link can read the full file, including secrets and personal data. No account or authentication is required. Links expire within three days.'
		}
	);
	server.registerTool(
		'create_trace_link',
		{
			title: 'Create temporary trace viewer link',
			description:
				'Upload a single trace JSON export and return an unlisted Traceview URL. Anyone with the URL can read the entire trace. The file is automatically deleted after 1 hour, 1 day, or 3 days. Does not fetch URLs or read local filesystem paths; supply the file contents as traceJson. Maximum HTTP request size including JSON-RPC envelope: 10 MB.',
			inputSchema: {
				traceJson: z
					.string()
					.min(1)
					.max(MAX_FILE_BYTES)
					.describe('The complete trace JSON file contents.'),
				ttlSeconds: z
					.union([z.literal(3600), z.literal(86400), z.literal(MAX_SHARE_SECONDS)])
					.default(MAX_SHARE_SECONDS)
					.describe('Lifetime: 3600 (1 hour), 86400 (1 day), or 259200 (3 days, default).')
			},
			outputSchema: {
				id: z.string().uuid(),
				url: z.string().url(),
				expiresAt: z.string().datetime()
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: true
			}
		},
		async ({ traceJson, ttlSeconds }) => {
			try {
				const saved = await saveTrace(traceJson, ttlSeconds);
				const result = {
					id: saved.id,
					url: `${url.origin}/s/${saved.id}`,
					expiresAt: new Date(saved.expiresAt).toISOString()
				};
				return {
					content: [{ type: 'text', text: JSON.stringify(result) }],
					structuredContent: result
				};
			} catch (e) {
				return {
					isError: true,
					content: [
						{
							type: 'text',
							text: isHttpError(e) ? e.body.message : 'Unable to create a trace link. Try again.'
						}
					]
				};
			}
		}
	);
	server.registerTool(
		'report_bug',
		{
			title: 'Report a Traceview bug',
			description:
				'Send a text-only bug report to Traceview’s triage agent. No authentication required. Do not include secrets or trace contents. Ask for the current Amp thread URL when using Amp, set reporterClient to amp, and include ampThreadUrl so a verified fix can be reported back. Generate reportId once and reuse it on retries. Queueing is not confirmation that a bug exists or has been fixed.',
			inputSchema: bugReportSchema,
			outputSchema: { id: z.string().regex(/^tv_bug_[a-z0-9]{24}$/), status: z.literal('queued') },
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true
			}
		},
		async (input) => {
			try {
				const allowed = await env.BUG_LIMITER.limit({
					key: request.headers.get('cf-connecting-ip') ?? 'local'
				});
				if (!allowed.success) error(429, 'Too many reports. Please try again in a minute.');
				const result = await submitBug(input);
				return {
					content: [{ type: 'text', text: JSON.stringify(result) }],
					structuredContent: result
				};
			} catch (e) {
				return {
					isError: true,
					content: [
						{
							type: 'text',
							text: isHttpError(e)
								? e.body.message
								: 'Unable to queue the report. Retry with the same report ID.'
						}
					]
				};
			}
		}
	);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
		maxRequestBodySize: MAX_FILE_BYTES
	});
	try {
		await server.connect(transport);
		const response = await transport.handleRequest(request);
		response.headers.set('Cache-Control', 'no-store');
		return response;
	} finally {
		await server.close();
	}
};
