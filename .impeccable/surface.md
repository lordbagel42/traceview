# Viewer surface

Mode: Operate. The user is investigating a single trace, not administering an observability backend.

## Direction contract

THESIS: one file, one trace, no ceremony. The waterfall is the workspace, not a dashboard tile.

OWN-WORLD: quiet neutral developer file inspector, not an observability dashboard. Charcoal surfaces, subtle neutral hairlines, compact controls, and precise monospace data. Geist supplies interface text; Geist Mono supplies measurements. Color identifies services, focus, selection, and errors rather than decorating the chrome. The earlier sidebar/overview/card composition was rejected as generic and copy-heavy.

STORY: open a file, see where time goes, select evidence, optionally share it for a bounded lifetime.

FIRST VIEWPORT: one 52px header with brand and, when loaded, filename plus Open file/Share. The empty state has an unboxed Open a trace prompt, one format hint, Choose file with shortcut, and a size/privacy note. No stepper, onboarding card, sidebar, or application footer. A dashed drag overlay is transient, not the resting empty state.

LOADED VIEW: compact title/ID and inline Duration, Spans, Services, and Errors metrics, then true Waterfall/Analysis tabs. The waterfall owns the full width until selection opens a 360px inspector; closing it restores that width. Keep the local service legend/window readout, not a global explanatory footer. Analysis is flat findings, collapsed instrumentation notes when present, and a service timing table, not summary cards.

FORM: code-led file inspector. Signature interaction: select a span and focus its time range without losing tree context. Service-table actions return to the filtered waterfall; findings with evidence reveal the relevant span. Attributes, Events, and Links are contextual inspector tabs. Share is an explicit upload decision with an access warning and a bounded lifetime, not an automatic side effect of opening a file.

RESPONSIVE: CSS uses 24px gutters and a 700px minimum waterfall table with 32px rows. At 1100px and below the inspector is 320px and analysis stacks; at 900px and below the inspector moves below the waterfall and metrics wrap. At 600px and below gutters are 16px, the filename hides, and search takes a full toolbar row. Keep horizontal table scrolling rather than crushing the time axis.

COPY: use labels and real evidence. Do not add introductory explanations, repeated metrics, success badges, default overview content, or a tutorial to fill space. Keep the privacy/upload warning because it changes the user's decision.

## Evidence and rationale

- Implementation authority: `src/lib/TraceViewer.svelte` and `src/routes/layout.css`; extracted tokens and component patterns are recorded in `DESIGN.md` and `.impeccable/design.json` (schemaVersion 2).
- Visual references for this redesign: `.amp/in/artifacts/redesign-{empty,waterfall,inspector,analysis,share,narrow,narrow-inspector}.png`. These capture states, not a substitute for current source.
- [NN/g: Prompt to Design Interfaces](https://www.nngroup.com/articles/vague-prototyping/): ground instructions in actual components/data and explicit hierarchy; avoid repeated elements and prominent low-information containers. Applied here as removing dashboard scaffolding and copy, not merely restyling it.
- [Linear: How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui): reduce chrome noise, align compact headers/tabs/panels, and test hierarchy across states. Apply those principles without copying Linear's sidebar, navigation model, or theme implementation.

FINISH: verify empty, full-width waterfall, selected inspector, analysis, sharing, and narrow layouts against the current source. Documentation-only refreshes do not claim a new browser test or visual audit.
