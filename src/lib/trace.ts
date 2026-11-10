export interface Span {
	id: string;
	traceId: string;
	parentId?: string;
	name: string;
	service: string;
	/** Absolute epoch milliseconds. */
	start: number;
	/** Milliseconds. */
	duration: number;
	error: boolean;
	attributes: Record<string, unknown>;
	events: unknown[];
	links: unknown[];
	depth: number;
	selfTime: number;
}

export interface Trace {
	id: string;
	spans: Span[];
	start: number;
	end: number;
	duration: number;
	services: string[];
	warnings: string[];
}

type Obj = Record<string, unknown>;
const MAX_SPANS = 10_000;
const MAX_TIME = 8.64e15;

function object(value: unknown): Obj {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Expected a trace or span object.');
	}
	return value as Obj;
}

function optionalObject(value: unknown): Obj {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : {};
}

function list(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function id(value: unknown, label: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing or invalid ${label}.`);
	return value.trim();
}

function typedValue(value: unknown, depth = 0): unknown {
	if (depth > 64) throw new Error('Attribute nesting exceeds 64 levels.');
	const v = optionalObject(value);
	for (const key of ['stringValue', 'boolValue', 'intValue', 'doubleValue', 'bytesValue']) {
		if (key in v) return v[key]; // Keep int64 strings losslessly.
	}
	if ('arrayValue' in v)
		return list(optionalObject(v.arrayValue).values).map((item) => typedValue(item, depth + 1));
	if ('kvlistValue' in v) return attributes(optionalObject(v.kvlistValue).values, depth + 1);
	return value;
}

function attributes(value: unknown, depth = 0): Obj {
	if (depth > 64) throw new Error('Attribute nesting exceeds 64 levels.');
	if (!Array.isArray(value)) return { ...optionalObject(value) };
	return Object.fromEntries(
		value.map((entry) => {
			const item = object(entry);
			return [id(item.key, 'attribute key'), typedValue(item.value, depth)];
		})
	);
}

function finite(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${label}.`);
	return value;
}

function nanos(value: unknown): number {
	if (typeof value === 'string' && /^\d+$/.test(value)) {
		const n = BigInt(value);
		return Number(n / BigInt(1_000_000)) + Number(n % BigInt(1_000_000)) / 1_000_000;
	}
	return finite(value, 'nanosecond timestamp') / 1_000_000;
}

function timestamp(value: unknown): number {
	if (typeof value === 'number') return finite(value, 'timestamp');
	if (
		typeof value !== 'string' ||
		!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)
	) {
		throw new Error('Invalid timestamp; expected epoch milliseconds or an ISO timestamp.');
	}
	const [year, month, day] = value.slice(0, 10).split('-').map(Number);
	const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	if (
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > days[month - 1] ||
		Number(value.slice(11, 13)) > 23
	) {
		throw new Error('Invalid calendar timestamp.');
	}
	const base = Date.parse(value);
	// Date.parse truncates fractional milliseconds; retain them when supplied.
	const fraction = value.match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1];
	return (
		base +
		(fraction ? Number(`0.${fraction}`) * 1000 - Number(fraction.slice(0, 3).padEnd(3, '0')) : 0)
	);
}

function durationMs(value: unknown): number {
	if (typeof value === 'number') return finite(value, 'duration');
	if (typeof value !== 'string') throw new Error('Missing or invalid duration.');
	const text = value.trim();
	// Axiom exports Go-style compound durations, e.g. "1m33.957339241s".
	if (!/^(?:(?:\d+(?:\.\d+)?|\.\d+)\s*(?:ns|us|µs|μs|ms|s|m|h)\s*)+$/.test(text))
		throw new Error(
			'Invalid duration; expected a number in milliseconds or a duration with units.'
		);
	const units: Record<string, number> = {
		ns: 1e-6,
		us: 1e-3,
		µs: 1e-3,
		μs: 1e-3,
		ms: 1,
		s: 1000,
		m: 60_000,
		h: 3_600_000
	};
	let total = 0;
	for (const match of text.matchAll(/(\d+(?:\.\d+)?|\.\d+)\s*(ns|us|µs|μs|ms|s|m|h)/g)) {
		total += Number(match[1]) * units[match[2]];
	}
	return total;
}

function flagged(value: unknown): boolean {
	return value === true || value === 1 || value === 'true';
}

type Source = {
	span: Obj;
	traceId?: unknown;
	processes?: Obj;
	resource?: Obj;
	scope?: Obj;
	wrapper?: Obj;
};

function sources(input: unknown): Source[] {
	const result: Source[] = [];
	const declaredTraces = new Set<string>();
	const declare = (value: unknown) => {
		if (value !== undefined) declaredTraces.add(id(value, 'trace ID'));
		if (declaredTraces.size > 1) throw new Error('Multiple traces found; load exactly one trace.');
	};
	const add = (span: unknown, context: Omit<Source, 'span'> = {}) => {
		if (result.length >= MAX_SPANS) throw new Error(`Trace exceeds ${MAX_SPANS} spans.`);
		result.push({ ...context, span: object(span) });
	};
	const root = Array.isArray(input) ? undefined : object(input);
	if (root && Array.isArray(root.resourceSpans)) {
		for (const resourceValue of root.resourceSpans) {
			const resource = object(resourceValue);
			for (const scopeValue of list(resource.scopeSpans ?? resource.instrumentationLibrarySpans)) {
				const scope = object(scopeValue);
				for (const span of list(scope.spans))
					add(span, {
						resource: attributes(optionalObject(resource.resource).attributes),
						scope: optionalObject(scope.scope ?? scope.instrumentationLibrary)
					});
			}
		}
	} else if (root && Array.isArray(root.data)) {
		for (const traceValue of root.data) {
			const trace = object(traceValue);
			declare(trace.traceID ?? trace.traceId);
			if (!Array.isArray(trace.spans))
				throw new Error('Invalid Jaeger trace: spans must be an array.');
			for (const span of trace.spans)
				add(span, {
					traceId: trace.traceID ?? trace.traceId,
					processes: optionalObject(trace.processes)
				});
		}
	} else {
		const rows = Array.isArray(input) ? input : root?.spans;
		if (!Array.isArray(rows))
			throw new Error('Unsupported trace format. Expected Jaeger, Axiom, OTLP, or a spans array.');
		if (root) declare(root.traceId ?? root.traceID ?? root.id);
		for (const rowValue of rows) {
			const row = object(rowValue);
			if (row.data && !Array.isArray(row.data)) add(row.data, { wrapper: row });
			else add(row, { traceId: root?.traceId ?? root?.traceID ?? root?.id });
		}
	}
	if (!result.length) throw new Error('Trace contains no spans.');
	for (const row of result) {
		declare(row.span.traceID ?? row.span.traceId ?? row.span.trace_id ?? row.traceId);
		if (row.traceId !== undefined) declare(row.traceId);
	}
	return result;
}

function normalize(source: Source): Span {
	const s = source.span;
	const jaeger = 'spanID' in s;
	const process = optionalObject(source.processes?.[String(s.processID)]);
	const attrs = {
		...attributes(process.tags),
		...source.resource,
		...s,
		...attributes(s.tags),
		...attributes(s.attributes)
	};
	if (source.scope && Object.keys(source.scope).length) attrs['otel.scope'] = source.scope;
	if (source.wrapper) {
		attrs['source.metadata'] = Object.fromEntries(
			Object.entries(source.wrapper).filter(([key]) => key !== 'data')
		);
	}
	const refs = list(s.references);
	const parentRef = refs.map(optionalObject).find((ref) => ref.refType === 'CHILD_OF');
	const parent = s.parentSpanId ?? s.parent_span_id ?? s.parentId ?? parentRef?.spanID;
	const start = jaeger
		? finite(s.startTime, 'Jaeger startTime') / 1000
		: s.startTimeUnixNano !== undefined
			? nanos(s.startTimeUnixNano)
			: timestamp(s.start ?? s.startTime ?? s._time ?? source.wrapper?._time);
	const end = s.endTimeUnixNano !== undefined ? nanos(s.endTimeUnixNano) : undefined;
	const nanoDuration =
		typeof s.startTimeUnixNano === 'string' && typeof s.endTimeUnixNano === 'string'
			? Number(BigInt(s.endTimeUnixNano) - BigInt(s.startTimeUnixNano)) / 1_000_000
			: undefined;
	const duration = jaeger
		? finite(s.duration, 'Jaeger duration') / 1000
		: (nanoDuration ?? (end !== undefined ? end - start : durationMs(s.duration)));
	if (
		!Number.isFinite(start) ||
		start < 0 ||
		start > MAX_TIME ||
		!Number.isFinite(duration) ||
		duration < 0 ||
		start + duration > MAX_TIME
	) {
		throw new Error('Invalid span timestamp or duration.');
	}
	const status = optionalObject(s.status);
	const statusCode = status.code ?? attrs['otel.status_code'];
	return {
		id: id(s.spanID ?? s.spanId ?? s.span_id ?? s.id, 'span ID'),
		traceId: id(s.traceID ?? s.traceId ?? s.trace_id ?? source.traceId, 'trace ID'),
		...(parent && !/^0{16}$/.test(String(parent))
			? { parentId: id(parent, 'parent span ID') }
			: {}),
		name:
			typeof (s.operationName ?? s.name) === 'string'
				? String(s.operationName ?? s.name)
				: '(unnamed span)',
		service: String(s.service ?? attrs['service.name'] ?? process.serviceName ?? 'unknown'),
		start,
		duration,
		error:
			flagged(s.error) ||
			flagged(attrs.error) ||
			statusCode === 2 ||
			statusCode === '2' ||
			statusCode === 'ERROR' ||
			statusCode === 'STATUS_CODE_ERROR',
		attributes: attrs,
		events: list(s.events ?? s.logs),
		links: list(s.links ?? s.references),
		depth: 0,
		selfTime: duration
	};
}

/** Length of a union of intervals, not the sum of overlapping durations. */
function covered(intervals: [number, number][]): number {
	intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	let total = 0;
	let end = -Infinity;
	for (const [left, right] of intervals) {
		total += Math.max(0, right - Math.max(left, end));
		end = Math.max(end, right);
	}
	return total;
}

export function parseTrace(input: unknown): Trace {
	if (typeof input === 'string') {
		try {
			input = JSON.parse(input);
		} catch {
			throw new Error('Invalid JSON trace.');
		}
	}
	const spans = sources(input).map(normalize);
	const byId = new Map<string, Span>();
	for (const span of spans) {
		if (byId.has(span.id)) throw new Error(`Duplicate span ID: ${span.id}`);
		byId.set(span.id, span);
	}
	const warnings: string[] = [];
	const children = new Map<string, Span[]>();
	const roots: Span[] = [];
	for (const span of spans) {
		const parent = span.parentId ? byId.get(span.parentId) : undefined;
		if (!parent) {
			roots.push(span);
			if (span.parentId)
				warnings.push(`Span ${span.id} has missing parent ${span.parentId}; displayed as a root.`);
		} else {
			const siblings = children.get(parent.id) ?? [];
			siblings.push(span);
			children.set(parent.id, siblings);
			if (
				span.start < parent.start ||
				span.start + span.duration > parent.start + parent.duration
			) {
				warnings.push(
					`Span ${span.id} extends outside parent ${parent.id}; child coverage is clipped for self time.`
				);
			}
		}
	}
	const compare = (a: Span, b: Span) => a.start - b.start || a.id.localeCompare(b.id);
	roots.sort(compare);
	for (const group of children.values()) group.sort(compare);
	const ordered: Span[] = [];
	const stack = [...roots].reverse();
	while (stack.length) {
		const span = stack.pop()!;
		ordered.push(span);
		const direct = children.get(span.id) ?? [];
		span.selfTime = Math.max(
			0,
			span.duration -
				covered(
					direct
						.map((child): [number, number] => [
							Math.max(0, child.start - span.start),
							Math.min(span.duration, child.start - span.start + child.duration)
						])
						.filter(([left, right]) => right > left)
				)
		);
		for (let i = direct.length - 1; i >= 0; i--) {
			direct[i].depth = span.depth + 1;
			stack.push(direct[i]);
		}
	}
	// Every node has at most one parent: nodes not reachable from roots belong
	// to a cycle (or descend from one). No recursive traversal is needed.
	if (ordered.length !== spans.length) throw new Error('Parent cycle detected in trace.');
	const start = Math.min(...spans.map((span) => span.start));
	const end = Math.max(...spans.map((span) => span.start + span.duration));
	return {
		id: spans[0].traceId,
		spans: ordered,
		start,
		end,
		duration: end - start,
		services: [...new Set(spans.map((span) => span.service))].sort(),
		warnings: warnings.sort()
	};
}

export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms)) return '—';
	if (ms === 0) return '0 ms';
	const absolute = Math.abs(ms);
	const [value, unit] =
		absolute < 0.001
			? [ms * 1e6, 'ns']
			: absolute < 1
				? [ms * 1000, 'µs']
				: absolute < 1000
					? [ms, 'ms']
					: absolute < 60_000
						? [ms / 1000, 's']
						: absolute < 3_600_000
							? [ms / 60_000, 'min']
							: [ms / 3_600_000, 'h'];
	// Correct multiplication noise at decimal half-way boundaries.
	return `${Number((value * (1 + Number.EPSILON)).toPrecision(4))} ${unit}`;
}

export function serviceMetrics(
	trace: Trace
): { service: string; count: number; errors: number; total: number; self: number }[] {
	const metrics = new Map<
		string,
		{ service: string; count: number; errors: number; total: number; self: number }
	>();
	for (const span of trace.spans) {
		const row = metrics.get(span.service) ?? {
			service: span.service,
			count: 0,
			errors: 0,
			total: 0,
			self: 0
		};
		row.count++;
		row.errors += Number(span.error);
		row.total += span.duration;
		row.self += span.selfTime;
		metrics.set(span.service, row);
	}
	return [...metrics.values()].sort(
		(a, b) => b.self - a.self || a.service.localeCompare(b.service)
	);
}

export function analyzeTrace(trace: Trace): { title: string; detail: string; spanId?: string }[] {
	const findings: { title: string; detail: string; spanId?: string }[] = [];
	const ranked = [...trace.spans].sort(
		(a, b) => b.selfTime - a.selfTime || a.id.localeCompare(b.id)
	);
	const longest = ranked[0];
	if (longest)
		findings.push({
			title: 'Largest self time',
			spanId: longest.id,
			detail: `${longest.service} · ${longest.name}: ${formatDuration(longest.selfTime)} excluding recorded direct-child coverage. This is not necessarily CPU time or a root cause.`
		});
	const errors = trace.spans
		.filter((span) => span.error)
		.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
	if (errors.length)
		findings.push({
			title: `${errors.length} error span${errors.length === 1 ? '' : 's'}`,
			spanId: errors[0].id,
			detail:
				'Recorded error status or error attributes; errors may describe the same propagated failure.'
		});
	const groups = new Map<
		string,
		{ service: string; name: string; count: number; sum: number; spanId: string }
	>();
	for (const span of [...trace.spans].sort((a, b) => a.id.localeCompare(b.id))) {
		const key = JSON.stringify([span.service, span.name]);
		const group = groups.get(key) ?? {
			service: span.service,
			name: span.name,
			count: 0,
			sum: 0,
			spanId: span.id
		};
		group.count++;
		group.sum += span.duration;
		groups.set(key, group);
	}
	for (const group of [...groups.values()]
		.filter((group) => group.count > 1)
		.sort(
			(a, b) => b.sum - a.sum || a.service.localeCompare(b.service) || a.name.localeCompare(b.name)
		)
		.slice(0, 5)) {
		findings.push({
			title: `${group.name} × ${group.count}`,
			spanId: group.spanId,
			detail: `${group.service} · ${formatDuration(group.sum)} summed duration.`
		});
	}
	const gap =
		trace.duration - covered(trace.spans.map((span) => [span.start, span.start + span.duration]));
	if (gap > 0.001)
		findings.push({
			title: 'Uncovered wall time',
			detail: `${formatDuration(gap)} of the trace envelope has no recorded span coverage. This may reflect missing instrumentation, not necessarily waiting.`
		});
	return findings;
}
