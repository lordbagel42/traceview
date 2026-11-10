import { describe, expect, it } from 'vitest';
import { analyzeTrace, formatDuration, parseTrace, serviceMetrics } from './trace';

const epoch = 1_700_000_000_000;
const span = (id: string, start = epoch, duration = 100, parentId?: string) => ({
	id,
	traceId: 'trace',
	name: 'work',
	service: 'api',
	start,
	duration,
	parentId
});

describe('parseTrace', () => {
	it('normalizes equivalent Jaeger and Axiom exports using local fixtures', () => {
		const jaeger = {
			data: [
				{
					traceID: 'trace',
					processes: { p: { serviceName: 'api', tags: [{ key: 'version', value: '1' }] } },
					spans: [
						{
							traceID: 'trace',
							spanID: 'child',
							operationName: 'child',
							processID: 'p',
							startTime: (epoch + 20) * 1000,
							duration: 1200,
							references: [{ refType: 'CHILD_OF', spanID: 'root' }],
							tags: [{ key: 'error', value: true }],
							logs: [{ message: 'failed' }]
						},
						{
							traceID: 'trace',
							spanID: 'root',
							operationName: 'root',
							processID: 'p',
							startTime: epoch * 1000,
							duration: 100_000,
							references: []
						}
					]
				}
			]
		};
		const axiom = [
			{
				_time: new Date(epoch + 20).toISOString(),
				data: {
					trace_id: 'trace',
					span_id: 'child',
					parent_span_id: 'root',
					name: 'child',
					'service.name': 'api',
					duration: '1.2ms',
					error: true,
					'attributes.custom': { answer: 42 },
					events: [{ message: 'failed' }]
				}
			},
			{
				_time: new Date(epoch).toISOString(),
				data: {
					trace_id: 'trace',
					span_id: 'root',
					name: 'root',
					'service.name': 'api',
					duration: '100ms'
				}
			}
		];
		const j = parseTrace(jaeger);
		const a = parseTrace(axiom);
		const comparable = (trace: ReturnType<typeof parseTrace>) =>
			trace.spans.map(({ attributes, links, ...rest }) => {
				expect(attributes).toBeDefined();
				expect(links).toBeDefined();
				return rest;
			});
		expect(comparable(j)).toEqual(comparable(a));
		expect(j.start).toBe(a.start);
		expect(j.duration).toBe(a.duration);
		expect(j.spans[1].attributes.version).toBe('1');
		expect(a.spans[1].attributes['attributes.custom']).toEqual({ answer: 42 });
		expect(a.spans[1].attributes['source.metadata']).toHaveProperty('_time');
	});

	it('subtracts union of clipped direct children, not their sum or grandchildren', () => {
		const trace = parseTrace([
			span('b', epoch + 40, 40, 'root'),
			span('grand', epoch + 30, 10, 'a'),
			span('root'),
			span('a', epoch + 20, 40, 'root'),
			span('beyond', epoch + 90, 30, 'root')
		]);
		expect(trace.spans.map((s) => [s.id, s.depth])).toEqual([
			['root', 0],
			['a', 1],
			['grand', 2],
			['b', 1],
			['beyond', 1]
		]);
		expect(trace.spans[0].selfTime).toBe(30);
		expect(trace.spans[1].selfTime).toBe(30);
		expect(trace.duration).toBe(120);
		expect(trace.warnings).toHaveLength(1);
	});

	it('does not manufacture self time from epoch timestamp rounding', () => {
		const trace = parseTrace([span('root', epoch, 1.2), span('child', epoch, 1.2, 'root')]);
		expect(trace.spans[0].selfTime).toBe(0);
	});

	it('retains missing parent IDs and displays orphan spans as roots', () => {
		const trace = parseTrace([span('orphan', epoch, 1, 'missing')]);
		expect(trace.spans[0]).toMatchObject({ parentId: 'missing', depth: 0, selfTime: 1 });
		expect(trace.warnings[0]).toMatch(/missing parent/);
	});

	it('clips children that start before or lie completely outside parents', () => {
		const trace = parseTrace([
			span('root', epoch + 10, 10),
			span('before', epoch, 15, 'root'),
			span('after', epoch + 30, 5, 'root')
		]);
		expect(trace.spans[0].id).toBe('root');
		expect(trace.spans[0].selfTime).toBe(5);
		expect(trace.start).toBe(epoch);
		expect(trace.end).toBe(epoch + 35);
		expect(trace.warnings).toHaveLength(2);
	});

	it('rejects cycles, including disconnected cycles and self-parenting', () => {
		expect(() => parseTrace([span('a', epoch, 1, 'a')])).toThrow(/cycle/i);
		expect(() =>
			parseTrace([span('root'), span('a', epoch, 1, 'b'), span('b', epoch, 1, 'a')])
		).toThrow(/cycle/i);
	});

	it('handles a 10,000-deep chain without recursive traversal', () => {
		const trace = parseTrace(
			Array.from({ length: 10_000 }, (_, i) =>
				span(String(i), epoch, 1, i ? String(i - 1) : undefined)
			).reverse()
		);
		expect(trace.spans).toHaveLength(10_000);
		expect(trace.spans[9999].depth).toBe(9999);
		expect(trace.spans[0].selfTime).toBe(0);
	});

	it('rejects more than 10,000 spans and duplicate IDs', () => {
		expect(() => parseTrace(Array.from({ length: 10_001 }, (_, i) => span(String(i))))).toThrow(
			/10000/
		);
		expect(() => parseTrace([span('a'), span('a')])).toThrow(/Duplicate/);
	});

	it('explicitly rejects multiple traces and contradictory envelope IDs', () => {
		expect(() => parseTrace([span('a'), { ...span('b'), traceId: 'other' }])).toThrow(
			/Multiple traces/
		);
		expect(() => parseTrace({ traceId: 'other', spans: [span('a')] })).toThrow(/Multiple traces/);
		expect(() =>
			parseTrace({
				data: [
					{ traceID: 'a', spans: [] },
					{ traceID: 'b', spans: [] }
				]
			})
		).toThrow(/Multiple traces/);
	});

	it('normalizes OTLP typed attributes, resource service, events and nanosecond strings', () => {
		const events = [{ name: 'exception', timeUnixNano: '1700000000000000001' }];
		const links = [{ traceId: 'linked', spanId: 'remote' }];
		const trace = parseTrace({
			resourceSpans: [
				{
					resource: { attributes: [{ key: 'service.name', value: { stringValue: 'worker' } }] },
					scopeSpans: [
						{
							scope: { name: 'library' },
							spans: [
								{
									traceId: 'trace',
									spanId: 'a',
									name: 'task',
									parentSpanId: '0000000000000000',
									startTimeUnixNano: '1700000000000123456',
									endTimeUnixNano: '1700000000001123457',
									status: { code: 2 },
									events,
									links,
									attributes: [
										{ key: 'flag', value: { boolValue: true } },
										{ key: 'large', value: { intValue: '9223372036854775807' } },
										{
											key: 'items',
											value: {
												arrayValue: { values: [{ doubleValue: 1.5 }, { stringValue: 'x' }] }
											}
										},
										{
											key: 'nested',
											value: {
												kvlistValue: { values: [{ key: 'key', value: { stringValue: 'value' } }] }
											}
										}
									]
								}
							]
						}
					]
				}
			]
		});
		expect(trace.spans[0]).toMatchObject({
			id: 'a',
			service: 'worker',
			start: epoch + 0.123456,
			duration: 1.000001,
			error: true,
			events,
			links
		});
		expect(trace.spans[0].parentId).toBeUndefined();
		expect(trace.spans[0].attributes).toMatchObject({
			flag: true,
			large: '9223372036854775807',
			items: [1.5, 'x'],
			nested: { key: 'value' },
			'otel.scope': { name: 'library' }
		});
	});

	it('preserves tiny OTLP durations instead of subtracting rounded epoch timestamps', () => {
		const trace = parseTrace([
			{
				traceId: 'trace',
				spanId: 'a',
				startTimeUnixNano: '1700000000000000001',
				endTimeUnixNano: '1700000000000000002'
			}
		]);
		expect(trace.spans[0].duration).toBe(0.000001);
	});

	it.each([
		NaN,
		Infinity,
		-1,
		'yesterday',
		'2026-02-30T00:00:00Z',
		'2026-01-01T24:00:00Z',
		'2026-01-01T00:00:00'
	])('rejects invalid timestamps: %s', (start) => {
		expect(() => parseTrace([{ ...span('a'), start }])).toThrow(/timestamp/i);
	});

	it.each([-1, Infinity, 'forever', '1fortnight'])('rejects invalid durations: %s', (duration) => {
		expect(() => parseTrace([{ ...span('a'), duration }])).toThrow(/duration/i);
	});

	it('rejects empty, malformed, and unidentified inputs', () => {
		for (const value of [null, [], {}, '{bad', [null], [{ start: epoch, duration: 1 }]]) {
			expect(() => parseTrace(value)).toThrow();
		}
	});

	it('accepts JSON text and standalone spans envelopes', () => {
		expect(parseTrace(JSON.stringify({ spans: [span('a')] })).spans[0].id).toBe('a');
		expect(
			parseTrace({ traceId: 'trace', spans: [{ id: 'a', start: epoch, duration: 1 }] }).id
		).toBe('trace');
	});

	it('decodes seconds, microseconds and nanoseconds and retains ISO sub-milliseconds', () => {
		for (const [duration, expected] of [
			['1.2s', 1200],
			['1m33.957339241s', 93957.339241],
			['1h2m3s4ms', 3723004],
			['23.655µs', 0.023655],
			['23.655μs', 0.023655],
			['20ns', 0.00002]
		] as const) {
			const trace = parseTrace([
				{
					_time: '2023-11-14T22:13:20.000500Z',
					data: { span_id: 'a', trace_id: 'trace', duration }
				}
			]);
			expect(trace.spans[0].duration).toBeCloseTo(expected, 9);
			expect(trace.start).toBe(epoch + 0.5);
		}
	});

	it('rejects pathological typed-attribute nesting without overflowing the stack', () => {
		const value: Record<string, unknown> = {};
		value.arrayValue = { values: [value] };
		expect(() => parseTrace([{ ...span('a'), attributes: [{ key: 'cycle', value }] }])).toThrow(
			/nesting/
		);
	});
});

describe('metrics and findings', () => {
	it('aggregates total and self time separately, without calling sums wall time', () => {
		const trace = parseTrace([
			span('root'),
			{ ...span('a', epoch + 10, 50, 'root'), service: 'db', error: true },
			{ ...span('b', epoch + 20, 50, 'root'), service: 'db' }
		]);
		expect(serviceMetrics(trace)).toEqual([
			{ service: 'db', count: 2, errors: 1, total: 100, self: 100 },
			{ service: 'api', count: 1, errors: 0, total: 100, self: 40 }
		]);
		const findings = analyzeTrace(trace);
		expect(findings[0].spanId).toBe('a');
		expect(findings.some((f) => /1 error span/.test(f.title))).toBe(true);
		expect(findings.find((f) => f.title.endsWith('× 2'))?.detail).toMatch(/100 ms summed duration/);
		expect(findings.some((f) => f.title === 'Uncovered wall time')).toBe(false);
		expect(analyzeTrace(parseTrace([...trace.spans].reverse()))).toEqual(findings);
	});

	it('reports union-based uncovered wall time across disconnected roots', () => {
		const trace = parseTrace([span('a', epoch, 10), span('b', epoch + 20, 10)]);
		expect(analyzeTrace(trace).find((f) => f.title === 'Uncovered wall time')?.detail).toMatch(
			/^10 ms/
		);
	});
});

describe('formatDuration', () => {
	it.each([
		[0, '0 ms'],
		[0.00002, '20 ns'],
		[0.023655, '23.66 µs'],
		[1.2, '1.2 ms'],
		[1200, '1.2 s'],
		[60_000, '1 min'],
		[3_600_000, '1 h'],
		[-1200, '-1.2 s'],
		[NaN, '—'],
		[Infinity, '—']
	])('formats %s as %s', (ms, formatted) => {
		expect(formatDuration(ms as number)).toBe(formatted);
	});
});
