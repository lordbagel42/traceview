<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import {
		Activity,
		Upload,
		FileJson,
		Search,
		ChevronRight,
		ChevronDown,
		ArrowUpRight,
		Shield,
		Link,
		Copy,
		Check,
		X,
		Download,
		RotateCcw,
		Focus,
		PanelRightClose,
		CircleAlert,
		ArrowDownWideNarrow
	} from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import {
		parseTrace,
		formatDuration as fmt,
		analyzeTrace,
		serviceMetrics,
		type Trace,
		type Span
	} from '#lib/trace.js';
	import { MAX_FILE_BYTES } from '#lib/limits.js';
	import BugReport from '#lib/BugReport.svelte';

	let { shareId }: { shareId?: string } = $props();
	let trace = $state<Trace | null>(null);
	let raw = $state('');
	let filename = $state('');
	let issue = $state('');
	let busy = $state(false);
	let dragging = $state(false);
	let input: HTMLInputElement;
	let searchInput = $state<HTMLInputElement | null>(null);
	let query = $state('');
	let service = $state('all');
	let errorsOnly = $state(false);
	let sort = $state('tree');
	let collapsed = $state(new Set<string>());
	let selectedId = $state<string | null>(null);
	let panel = $state('waterfall');
	let detailTab = $state('attributes');
	let range = $state<[number, number] | null>(null);
	let shareOpen = $state(false);
	let ttl = $state('259200');
	let shareUrl = $state('');
	let expiresAt = $state<number | null>(null);
	let shareBusy = $state(false);
	let shareError = $state('');
	let copied = $state(false);
	let loadGeneration = 0;
	let attrQuery = $state('');
	const colors = ['#79a9f5', '#ba9aec', '#79c9ab', '#e1b878', '#e394a1', '#80c6d4'];
	let selected = $derived(trace?.spans.find((s) => s.id === selectedId));
	let metrics = $derived(trace ? serviceMetrics(trace) : []);
	let findings = $derived(trace ? analyzeTrace(trace) : []);
	let errorCount = $derived(trace?.spans.filter((s) => s.error).length ?? 0);
	let childIds = $derived(new Set(trace?.spans.map((s) => s.parentId).filter(Boolean)));
	let from = $derived(range?.[0] ?? trace?.start ?? 0);
	let to = $derived(range?.[1] ?? trace?.end ?? 1);
	let windowDuration = $derived(Math.max(to - from, 0.001));
	let filtered = $derived.by(() => {
		if (!trace) return [];
		const hidden = new SvelteSet<string>();
		const spans = trace.spans.filter((s) => {
			if (sort === 'tree' && !query && service === 'all' && !errorsOnly) {
				if (s.parentId && (collapsed.has(s.parentId) || hidden.has(s.parentId))) {
					hidden.add(s.id);
					return false;
				}
			}
			return (
				(service === 'all' || s.service === service) &&
				(!errorsOnly || s.error) &&
				(!query ||
					`${s.name} ${s.service} ${s.id} ${JSON.stringify(s.attributes)}`
						.toLowerCase()
						.includes(query.toLowerCase())) &&
				(!range || (s.start <= to && s.start + s.duration >= from))
			);
		});
		return sort === 'duration'
			? spans.toSorted((a, b) => b.duration - a.duration)
			: sort === 'self'
				? spans.toSorted((a, b) => b.selfTime - a.selfTime)
				: spans;
	});
	let attributes = $derived(
		Object.entries(selected?.attributes ?? {}).filter(([k, v]) =>
			`${k} ${JSON.stringify(v)}`.toLowerCase().includes(attrQuery.toLowerCase())
		)
	);
	function color(s: string) {
		return colors[(trace?.services.indexOf(s) ?? 0) % colors.length];
	}
	function toggle(id: string) {
		const next = new SvelteSet(collapsed);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		collapsed = next;
	}
	function load(text: string, name: string) {
		const parsed = parseTrace(JSON.parse(text));
		loadGeneration++;
		trace = parsed;
		raw = text;
		filename = name;
		selectedId = null;
		range = null;
		collapsed = new Set();
		query = '';
		service = 'all';
		errorsOnly = false;
		issue = '';
		panel = 'waterfall';
		shareUrl = '';
		expiresAt = null;
	}
	async function openFile(file?: File) {
		if (!file) return;
		issue = '';
		busy = true;
		try {
			if (file.size > MAX_FILE_BYTES)
				throw new Error('This file is over 10 MB. Export a smaller, single trace.');
			await tick();
			await new Promise((resolve) => setTimeout(resolve, 0));
			load(await file.text(), file.name);
			if (shareId) history.replaceState(null, '', '/');
		} catch (e) {
			issue = e instanceof Error ? e.message : 'Unable to read this JSON file.';
		} finally {
			busy = false;
			input.value = '';
		}
	}
	async function drop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		await openFile(event.dataTransfer?.files[0]);
	}
	function selectSpan(span: Span) {
		selectedId = span.id;
		attrQuery = '';
		detailTab = 'attributes';
	}
	async function focusSpan() {
		if (selected) {
			range = [selected.start, selected.start + Math.max(selected.duration, 0.001)];
			panel = 'waterfall';
			await tick();
			if (window.matchMedia('(max-width: 900px)').matches) {
				document.getElementById(`span-${selected.id}`)?.scrollIntoView({ block: 'center' });
				document.querySelector('.waterfall-toolbar')?.scrollIntoView({ block: 'start' });
			}
		}
	}
	async function revealSpan(id?: string) {
		if (!trace || !id) return;
		selectedId = id;
		panel = 'waterfall';
		query = '';
		service = 'all';
		errorsOnly = false;
		collapsed = new Set();
		range = null;
		await tick();
		document.getElementById(`span-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}
	$effect(() => {
		if (selectedId && window.matchMedia('(max-width: 900px)').matches) {
			void tick().then(() =>
				document.querySelector('.inspector')?.scrollIntoView({ block: 'start' })
			);
		}
	});
	function download() {
		const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = filename || 'trace.json';
		a.click();
		URL.revokeObjectURL(url);
	}
	async function share() {
		const generation = loadGeneration;
		shareBusy = true;
		shareError = '';
		try {
			const response = await fetch(`/api/traces?ttl=${ttl}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: raw
			});
			const result = (await response.json()) as { message?: string; id: string; expiresAt: number };
			if (generation !== loadGeneration) return;
			if (!response.ok) throw new Error(result.message ?? 'Unable to create a link. Try again.');
			shareUrl = `${location.origin}/s/${result.id}`;
			expiresAt = result.expiresAt;
		} catch (e) {
			if (generation === loadGeneration)
				shareError = e instanceof Error ? e.message : 'Unable to create a link.';
		} finally {
			shareBusy = false;
		}
	}
	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			shareError = 'Clipboard unavailable. Select and copy the link below.';
		}
	}
	function keyboard(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('input,textarea,select,[role="dialog"],[role="tablist"]')) return;
		if (e.key === '/' && trace) {
			e.preventDefault();
			searchInput?.focus();
		}
		if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
			e.preventDefault();
			input.click();
		}
		if (e.key === 'Escape') {
			selectedId = null;
			range = null;
		}
		if (['ArrowDown', 'ArrowUp'].includes(e.key) && trace && filtered.length) {
			e.preventDefault();
			const index = filtered.findIndex((s) => s.id === selectedId);
			const next =
				filtered[
					Math.max(0, Math.min(filtered.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))
				];
			selectSpan(next);
			document.getElementById(`span-${next.id}`)?.scrollIntoView({ block: 'nearest' });
		}
	}
	onMount(() => {
		if (!shareId) return;
		const controller = new AbortController();
		busy = true;
		void (async () => {
			try {
				const response = await fetch(`/api/traces/${shareId}`, { signal: controller.signal });
				const data = (await response.json()) as {
					message?: string;
					raw: string;
					expiresAt: number;
				};
				if (!response.ok) throw new Error(data.message ?? 'This trace is unavailable.');
				load(data.raw, 'shared-trace.json');
				expiresAt = data.expiresAt;
				shareUrl = location.href;
			} catch (e) {
				if (!controller.signal.aborted)
					issue = e instanceof Error ? e.message : 'Unable to load trace.';
			} finally {
				busy = false;
			}
		})();
		return () => controller.abort();
	});
</script>

<svelte:head>
	<title>{trace ? `${trace.spans[0]?.name} · Traceview` : 'Traceview'}</title>
	<meta
		name="description"
		content="A fast, local-first OpenTelemetry and Jaeger trace viewer. Drop a JSON file, inspect the waterfall, and optionally share it for up to three days."
	/>
</svelte:head>

<svelte:window
	onkeydown={keyboard}
	ondragover={(e) => {
		e.preventDefault();
		dragging = e.dataTransfer?.types.includes('Files') ?? false;
	}}
	ondragleave={(e) => {
		if (!e.relatedTarget) dragging = false;
	}}
	ondrop={drop}
/>
<input
	bind:this={input}
	id="trace-file"
	type="file"
	aria-label="Open trace JSON file"
	accept=".json,application/json"
	class="sr-only"
	tabindex="-1"
	onchange={(e) => openFile(e.currentTarget.files?.[0])}
/>

<div class="app-shell">
	<div class="workspace">
		<header class="topbar">
			<a class="brand" href={resolve('/')} aria-label="Traceview home"
				><Activity size={18} /><span>traceview</span></a
			>
			{#if trace}<span class="header-filename" title={filename}>{filename}</span>{/if}
			<div class="header-actions">
				<BugReport />
				{#if trace}<Button variant="ghost" onclick={() => input.click()} disabled={busy}
						>Open file</Button
					><Button
						variant="outline"
						onclick={() => {
							shareOpen = true;
							shareError = '';
						}}><Link size={14} /> Share</Button
					>{:else}<a
						class="source-link"
						href="https://github.com/lordbagel42/traceview"
						target="_blank"
						rel="noreferrer">GitHub <ArrowUpRight size={13} /></a
					>{/if}
			</div>
		</header>
		{#if issue}<div class="error-banner" role="alert">
				<CircleAlert size={17} /><span>{issue}</span><Button
					variant="ghost"
					size="icon-sm"
					aria-label="Dismiss error"
					onclick={() => (issue = '')}><X size={15} /></Button
				>
			</div>{/if}
		{#if busy}<div class="loading" role="status"><Activity size={24} /> Reading trace…</div>
		{:else if !trace}
			<main class="empty-workspace">
				<div class="file-picker">
					<FileJson size={30} strokeWidth={1.25} />
					<h1>Open a trace</h1>
					<p>Drop an OpenTelemetry, Jaeger, or Axiom JSON file.</p>
					<Button onclick={() => input.click()}
						>Choose file <span class="button-shortcut">⌘/Ctrl O</span></Button
					>
					<span class="file-limit">Up to 10 MB. Stays in your browser until shared.</span>
				</div>
			</main>
		{:else}
			<section class="trace-heading">
				<div>
					<div class="trace-title-row">
						<h1>{trace.spans.find((s) => !s.parentId)?.name ?? trace.spans[0].name}</h1>
					</div>
					<div class="trace-subtitle">
						<span class="mono">{trace.id}</span><Button
							size="icon-sm"
							variant="ghost"
							aria-label="Copy trace ID"
							title="Copy trace ID"
							onclick={() => copy(trace!.id)}
							>{#if copied}<Check size={13} />{:else}<Copy size={13} />{/if}</Button
						>
					</div>
				</div>
				<dl class="trace-metrics" aria-label="Trace metrics">
					<div>
						<dt>Duration</dt>
						<dd>{fmt(trace.duration)}</dd>
					</div>
					<div>
						<dt>Spans</dt>
						<dd>{trace.spans.length}</dd>
					</div>
					<div>
						<dt>Services</dt>
						<dd>{trace.services.length}</dd>
					</div>
					<div>
						<dt>Errors</dt>
						<dd class:danger={errorCount > 0}>
							{errorCount}<span class="error-rate">
								/ {((errorCount / trace.spans.length) * 100).toFixed(1)}%</span
							>
						</dd>
					</div>
				</dl>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Download original JSON"
					title="Download original JSON"
					onclick={download}><Download size={17} /></Button
				>
			</section>
			{#if expiresAt}<div class="expiration-note">
					<Link size={13} /> Expires {new Date(expiresAt).toLocaleString()}. Anyone with the link
					can read it.
				</div>{/if}
			<Tabs.Root bind:value={panel} class="trace-views">
				<Tabs.List class="view-tabs" aria-label="Trace view"
					><Tabs.Trigger value="waterfall">Waterfall</Tabs.Trigger><Tabs.Trigger value="analysis"
						>Analysis <span>{findings.length}</span></Tabs.Trigger
					></Tabs.List
				>
				<Tabs.Content value="analysis">
					<main class="analysis-page">
						<div class="analysis-grid">
							<section class="panel">
								<div class="panel-heading">
									<h3>Findings</h3>
								</div>
								<p class="panel-description">
									Summed durations can overlap and exceed wall time. Repetition alone does not
									establish a problem.
								</p>
								{#each findings as f, i (i)}<button
										class="finding"
										onclick={() => revealSpan(f.spanId)}
										disabled={!f.spanId}
										><strong>{f.title}</strong>
										<p>{f.detail}</p>
										{#if f.spanId}<ArrowUpRight size={14} class="finding-link" />{/if}</button
									>{/each}
								{#if trace.warnings.length}<details class="instrumentation-notes">
										<summary>Instrumentation notes <span>{trace.warnings.length}</span></summary
										>{#each trace.warnings as warning, i (i)}<p>{warning}</p>{/each}
									</details>{/if}
							</section>
							<section class="panel">
								<div class="panel-heading">
									<h3>Services</h3>
								</div>
								<p class="panel-description">
									Self time excludes direct-child coverage. Totals can exceed wall time.
								</p>
								<div class="service-table-scroll">
									<table class="service-table">
										<thead
											><tr><th>Service</th><th>Spans</th><th>Self time</th><th>Total</th></tr
											></thead
										><tbody
											>{#each metrics as m (m.service)}<tr
													><th
														><button
															onclick={() => {
																service = m.service;
																panel = 'waterfall';
															}}
															><i class="service-dot" style:background={color(m.service)}
															></i>{m.service}<ArrowUpRight size={13} /></button
														></th
													><td>{m.count}</td><td>{fmt(m.self)}</td><td>{fmt(m.total)}</td></tr
												>{/each}</tbody
										>
									</table>
								</div>
							</section>
						</div>
					</main>
				</Tabs.Content>
				<Tabs.Content value="waterfall">
					<main class="explorer" class:with-inspector={!!selected}>
						<section class="waterfall-panel">
							<div class="waterfall-toolbar">
								<div class="search-box">
									<Search size={15} /><Input
										bind:ref={searchInput}
										bind:value={query}
										placeholder="Search spans…"
										aria-label="Search spans"
									/><kbd>/</kbd>
								</div>
								<select bind:value={service} aria-label="Filter by service"
									><option value="all">All services</option>{#each metrics as m (m.service)}<option
											value={m.service}>{m.service} ({m.count})</option
										>{/each}</select
								>
								<button
									class="filter-button"
									class:filter-active={errorsOnly}
									aria-pressed={errorsOnly}
									onclick={() => (errorsOnly = !errorsOnly)}
									><CircleAlert size={14} /> Errors</button
								><select bind:value={sort} aria-label="Sort spans"
									><option value="tree">Tree order</option><option value="duration"
										>Longest duration</option
									><option value="self">Longest self time</option></select
								><Button
									variant="ghost"
									size="icon-sm"
									title="Expand all spans"
									aria-label="Expand all spans"
									onclick={() => (collapsed = new Set())}><ArrowDownWideNarrow size={16} /></Button
								>
							</div>
							<div class="waterfall-context">
								<span
									>{filtered.length === trace.spans.length
										? `${filtered.length} spans`
										: `${filtered.length} / ${trace.spans.length} spans`}
									{#if service !== 'all'}<button
											class="inline-reset"
											onclick={() => (service = 'all')}>{service} <X size={12} /></button
										>{/if}</span
								><span
									>{#if range}<button class="inline-reset" onclick={() => (range = null)}
											><RotateCcw size={12} /> Reset zoom</button
										>{/if}</span
								>
							</div>
							<div class="waterfall-scroll">
								<div class="waterfall-table">
									<div class="waterfall-axis">
										<div>Operation <span>Duration</span></div>
										<div class="axis-ticks">
											{#each [0, 1, 2, 3, 4] as n (n)}<span style:left={`${n * 25}%`}
													>{fmt(from - trace.start + (windowDuration * n) / 4)}</span
												>{/each}
										</div>
									</div>
									{#each filtered as span (span.id)}
										{@const left = Math.max(0, ((span.start - from) / windowDuration) * 100)}
										{@const width = Math.max(
											0,
											Math.min(100, ((span.start + span.duration - from) / windowDuration) * 100) -
												left
										)}
										<div
											id={`span-${span.id}`}
											class="span-row"
											class:selected={selectedId === span.id}
										>
											<div
												class="operation-cell"
												style:padding-left={`${12 + Math.min(span.depth, 8) * 11}px`}
											>
												{#if childIds.has(span.id) && sort === 'tree'}<button
														class="collapse-button"
														title={`${collapsed.has(span.id) ? 'Expand' : 'Collapse'} child spans`}
														aria-label={`${collapsed.has(span.id) ? 'Expand' : 'Collapse'} ${span.name}`}
														aria-expanded={!collapsed.has(span.id)}
														onclick={() => toggle(span.id)}
														>{#if collapsed.has(span.id)}<ChevronRight
																size={13}
															/>{:else}<ChevronDown size={13} />{/if}</button
													>{:else}<span class="tree-spacer"></span>{/if}
												<button
													class="span-name"
													onclick={() => selectSpan(span)}
													title={`${span.service} · ${span.name}`}
													><i
														class="service-dot"
														style:background={span.error ? '#ef9393' : color(span.service)}
													></i><span>{span.name}</span>{#if span.error}<CircleAlert
															size={12}
															class="danger"
														/>{/if}</button
												><span class="span-duration mono">{fmt(span.duration)}</span>
											</div>
											<button
												class="timeline-cell"
												aria-label={`Inspect ${span.name}, ${fmt(span.duration)}`}
												onclick={() => selectSpan(span)}
												ondblclick={() => {
													selectSpan(span);
													focusSpan();
												}}
												title={`${span.name} · ${fmt(span.duration)} · Double-click to zoom`}
												><span
													class="timeline-bar"
													class:error-bar={span.error}
													style:left={`${Math.min(left, 100)}%`}
													style:width={`max(3px, ${width}%)`}
													style:background={span.error ? '#df7f86' : color(span.service)}
												></span></button
											>
										</div>
									{:else}<div class="no-results">
											<Search size={22} /><strong>No matching spans</strong>
											<p>Try a different search or clear the filters.</p>
											<Button
												variant="outline"
												onclick={() => {
													query = '';
													service = 'all';
													errorsOnly = false;
													range = null;
												}}>Clear filters</Button
											>
										</div>{/each}
								</div>
							</div>
							<div class="waterfall-footer">
								<span
									>{#each trace.services as s (s)}<span
											><i class="service-dot" style:background={color(s)}></i>{s}</span
										>{/each}</span
								><span class="mono">{fmt(windowDuration)} window</span>
							</div>
						</section>
						{#if selected}
							<aside class="inspector">
								<div class="panel-heading">
									<h2>Span details</h2>
									<Button
										size="icon-sm"
										variant="ghost"
										aria-label="Close span details"
										onclick={() => (selectedId = null)}><PanelRightClose size={16} /></Button
									>
								</div>
								<div class="inspector-summary">
									<span class="inspector-service"
										><i class="service-dot" style:background={color(selected.service)}
										></i>{selected.service}</span
									>
									<h2>{selected.name}</h2>
									<div class="span-id mono">
										{selected.id}<Button
											variant="ghost"
											size="icon-xs"
											aria-label="Copy span ID"
											onclick={() => copy(selected!.id)}><Copy size={12} /></Button
										>
									</div>
									<div class="span-stats">
										<div>
											<span>Duration</span><strong class="mono">{fmt(selected.duration)}</strong>
										</div>
										<div>
											<span>Self time</span><strong class="mono">{fmt(selected.selfTime)}</strong>
										</div>
										<div>
											<span>Start offset</span><strong class="mono"
												>+{fmt(selected.start - trace.start)}</strong
											>
										</div>
										<div>
											<span>Status</span><strong class:error-text={selected.error}
												>{selected.error ? 'Error' : 'No error'}</strong
											>
										</div>
									</div>
									<div class="inspector-actions">
										<Button variant="outline" size="sm" onclick={focusSpan}
											><Focus size={14} /> Focus span</Button
										>{#if selected.parentId && trace.spans.some((s) => s.id === selected?.parentId)}<Button
												variant="ghost"
												size="sm"
												onclick={() => revealSpan(selected?.parentId)}
												>Go to parent <ArrowUpRight size={13} /></Button
											>{/if}
									</div>
								</div>
								<Tabs.Root bind:value={detailTab} class="detail-tabs"
									><Tabs.List class="inspector-tabs"
										><Tabs.Trigger value="attributes"
											>Attributes <span>{Object.keys(selected.attributes).length}</span
											></Tabs.Trigger
										><Tabs.Trigger value="events"
											>Events <span>{selected.events.length}</span></Tabs.Trigger
										><Tabs.Trigger value="links"
											>Links <span>{selected.links.length}</span></Tabs.Trigger
										></Tabs.List
									><Tabs.Content value="attributes"
										><div class="attribute-search">
											<Input
												bind:value={attrQuery}
												aria-label="Filter attributes"
												placeholder="Filter attributes…"
											/>
										</div>
										<dl class="attributes">
											{#each attributes as [key, value] (key)}<div>
													<dt>{key}</dt>
													<dd>
														{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
													</dd>
												</div>{:else}<p class="detail-empty">No matching attributes.</p>{/each}
										</dl></Tabs.Content
									><Tabs.Content value="events"
										>{#each selected.events as event, i (i)}<pre class="event-json">{JSON.stringify(
													event,
													null,
													2
												)}</pre>{:else}<p class="detail-empty">
												No events recorded for this span.
											</p>{/each}</Tabs.Content
									><Tabs.Content value="links"
										>{#each selected.links as link, i (i)}<pre class="event-json">{JSON.stringify(
													link,
													null,
													2
												)}</pre>{:else}<p class="detail-empty">
												No links recorded for this span.
											</p>{/each}</Tabs.Content
									></Tabs.Root
								>
							</aside>{/if}
					</main>
				</Tabs.Content></Tabs.Root
			>
		{/if}
	</div>
</div>

{#if dragging}<div class="drag-overlay" role="presentation" ondragleave={() => (dragging = false)}>
		<Upload size={32} /><strong>Drop to open</strong>
	</div>{/if}

<Dialog.Root bind:open={shareOpen}
	><Dialog.Content class="share-dialog"
		><Dialog.Header
			><Dialog.Title>Share trace</Dialog.Title><Dialog.Description
				>Upload this file to create a temporary link.</Dialog.Description
			></Dialog.Header
		>{#if shareUrl}
			<label for="share-link">Trace link</label>
			<div class="share-link-row">
				<Input
					id="share-link"
					value={shareUrl}
					readonly
					onclick={(e) => e.currentTarget.select()}
				/><Button variant="outline" onclick={() => copy(shareUrl)} aria-label="Copy share link"
					>{#if copied}<Check size={16} />{:else}<Copy size={16} />{/if}</Button
				>
			</div>
			<p class="share-expiry">
				Expires {expiresAt ? new Date(expiresAt).toLocaleString() : ''}. The link cannot be
				extended.
			</p>{:else}<div class="share-warning">
				<Shield size={19} />
				<p>
					<strong>Anyone with the link can read the full trace.</strong>
					Check for secrets and personal data before uploading.
				</p>
			</div>
			<label for="share-lifetime">Automatically delete after</label><select
				id="share-lifetime"
				bind:value={ttl}
				><option value="3600">1 hour</option><option value="86400">1 day</option><option
					value="259200">3 days</option
				></select
			><Button class="full-width" onclick={share} disabled={shareBusy}
				><Link size={15} />{shareBusy ? 'Creating link…' : 'Upload & create link'}</Button
			>{/if}{#if shareError}<p class="error-text" role="alert">{shareError}</p>{/if}
		<p class="share-footnote">
			Automatically deleted at expiry. Downloaded copies cannot be recalled.
		</p></Dialog.Content
	></Dialog.Root
>
