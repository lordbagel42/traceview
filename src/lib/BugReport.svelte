<script lang="ts">
	import { Bug, Check } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';

	let open = $state(false);
	let title = $state('');
	let details = $state('');
	let ampThreadUrl = $state('');
	let reportId = $state('');
	let sent = $state(false);
	let busy = $state(false);
	let issue = $state('');
	let submitted = $state<string | null>(null);

	function show() {
		if (sent) {
			title = '';
			details = '';
			ampThreadUrl = '';
			reportId = '';
			sent = false;
			submitted = null;
			issue = '';
		}
		open = true;
	}
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		reportId ||=
			'tv_bug_' +
			Array.from(
				crypto.getRandomValues(new Uint8Array(24)),
				(n) => 'abcdefghijklmnopqrstuvwxyz0123456789'[n % 36]
			).join('');
		submitted ??= JSON.stringify({
			reportId,
			title,
			details,
			reporterClient: 'browser',
			...(ampThreadUrl.trim() ? { ampThreadUrl: ampThreadUrl.trim() } : {})
		});
		busy = true;
		issue = '';
		try {
			const response = await fetch('/api/bugs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: submitted
			});
			if (!response.ok) {
				const result = (await response.json().catch(() => ({}))) as { message?: string };
				throw new Error(result.message ?? 'Unable to send. Please try again.');
			}
			sent = true;
		} catch (e) {
			issue = e instanceof Error ? e.message : 'Unable to send. Please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<Button variant="ghost" onclick={show}><Bug size={14} />Report bug</Button>
<Dialog.Root bind:open>
	<Dialog.Content class="share-dialog bug-dialog">
		<Dialog.Header>
			<Dialog.Title>{sent ? 'Report queued' : 'Report a bug'}</Dialog.Title>
			<Dialog.Description
				>{sent
					? 'Sent to the triage agent for investigation.'
					: 'What happened, and what did you expect?'}</Dialog.Description
			>
		</Dialog.Header>
		{#if sent}
			<p class="bug-receipt" role="status"><Check size={16} />Report received</p>
			<code class="bug-id">{reportId}</code>
			<p class="share-footnote">
				{ampThreadUrl
					? 'If a fix ships, we’ll try to update your Amp thread.'
					: 'Keep this ID if you need to follow up.'}
			</p>
			<Button onclick={() => (open = false)}>Done</Button>
		{:else}
			<form class="bug-form" onsubmit={submit}>
				<label for="bug-title">Summary</label>
				<Input
					id="bug-title"
					bind:value={title}
					required
					maxlength={160}
					disabled={submitted !== null}
				/>
				<label for="bug-details">Details</label>
				<textarea
					id="bug-details"
					bind:value={details}
					required
					maxlength={8000}
					rows={5}
					disabled={submitted !== null}></textarea>
				<label for="bug-thread">Amp thread <span class="bug-optional">(optional)</span></label>
				<Input
					id="bug-thread"
					type="url"
					bind:value={ampThreadUrl}
					placeholder="https://ampcode.com/threads/T-…"
					pattern="https://ampcode\.com/threads/T-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
					disabled={submitted !== null}
					aria-describedby="bug-privacy"
				/>
				<p id="bug-privacy" class="share-footnote">
					No trace is attached. Don’t include secrets. Reports go to our Amp triage agent.
				</p>
				{#if issue}
					<p class="error-text" role="alert">{issue}</p>
					<p class="share-footnote">
						Retry sends the same report. The original may already have arrived.
					</p>
					<Button
						type="button"
						variant="outline"
						onclick={() => {
							submitted = null;
							reportId = '';
							issue = '';
						}}>Edit as new report</Button
					>
				{/if}
				<Button type="submit" disabled={busy || !title.trim() || !details.trim()}
					>{busy ? 'Sending…' : submitted ? 'Retry report' : 'Send report'}</Button
				>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
