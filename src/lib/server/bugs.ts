import { error } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { z } from 'zod';

export const bugReportSchema = z
	.object({
		reportId: z
			.string()
			.regex(/^tv_bug_[a-z0-9]{24}$/)
			.describe(
				'Use tv_bug_ followed by 24 random lowercase letters/digits; reuse it when retrying.'
			),
		title: z.string().trim().min(1).max(160),
		details: z.string().trim().min(1).max(8000),
		reporterClient: z.enum(['browser', 'amp', 'other']),
		ampThreadUrl: z
			.string()
			.regex(
				/^https:\/\/ampcode\.com\/threads\/T-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
			)
			.optional()
	})
	.strict()
	.superRefine((report, ctx) => {
		if (report.reporterClient === 'amp' && !report.ampThreadUrl)
			ctx.addIssue({
				code: 'custom',
				path: ['ampThreadUrl'],
				message: 'Amp agents must supply their current Amp thread URL for fix notifications.'
			});
	});

export async function submitBug(input: unknown) {
	const parsed = bugReportSchema.safeParse(input);
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Invalid bug report.');
	const webhook = env.BUG_REPORT_WEBHOOK;
	if (!webhook) error(503, 'Bug reporting is unavailable. Please try again later.');
	const { reportId, ...report } = parsed.data;
	let response: Response;
	try {
		response = await fetch(webhook, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Idempotency-Key': reportId },
			body: JSON.stringify({ id: reportId, ...report }),
			signal: AbortSignal.timeout(8000),
			redirect: 'manual'
		});
	} catch {
		error(503, 'Unable to queue the report. Retry with the same report ID.');
	}
	if (response.status === 409)
		error(
			409,
			'Report ID was already used for different contents. Retry the original report or use a new ID.'
		);
	if (!response.ok) error(503, 'Unable to queue the report. Retry with the same report ID.');
	return { id: reportId, status: 'queued' as const };
}
