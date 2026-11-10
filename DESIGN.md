---
name: Traceview
description: A quiet developer file inspector for one trace.
colors:
  background: '#111112'
  foreground: '#ededef'
  primary: '#ededef'
  primary-foreground: '#18181b'
  secondary: '#242427'
  muted-foreground: '#a1a1aa'
  border: '#2a2a2e'
  field: '#171719'
  inspector: '#151517'
  dialog: '#19191c'
  selected: '#222b3b'
  ring: '#91b4ee'
  destructive: '#ee979f'
typography:
  headline:
    fontFamily: 'Geist Variable, sans-serif'
    fontSize: '20px'
    fontWeight: 500
    letterSpacing: '-0.5px'
  title:
    fontFamily: 'Geist Variable, sans-serif'
    fontSize: '18px'
    fontWeight: 500
    letterSpacing: '-0.4px'
  body:
    fontFamily: 'Geist Variable, sans-serif'
    fontSize: '13px'
    fontWeight: 400
  label:
    fontFamily: 'Geist Variable, sans-serif'
    fontSize: '11px'
    fontWeight: 400
  data:
    fontFamily: 'Geist Mono Variable, monospace'
    fontSize: '10px'
    fontWeight: 400
rounded:
  sm: '4px'
  md: '5px'
  lg: '6px'
  dialog: '8px'
spacing:
  tight: '6px'
  sm: '8px'
  control: '10px'
  panel: '20px'
  workspace: '24px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.md}'
    height: '32px'
  button-outline:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
  input-search:
    backgroundColor: '{colors.field}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.lg}'
    height: '30px'
  inspector:
    backgroundColor: '{colors.inspector}'
    textColor: '{colors.foreground}'
  span-selected:
    backgroundColor: '{colors.selected}'
    height: '32px'
---

# Design System: Traceview

## Overview

**Creative North Star: "The Quiet File Inspector"**

A neutral developer file inspector: compact chrome, subtle hairlines, precise measurements, and minimal copy. The trace is the workspace, not content inside a dashboard shell.

Extracted from `src/lib/TraceViewer.svelte`, `src/routes/layout.css`, and the shipped button, input, tabs, and dialog primitives. Source takes precedence over older design descriptions and screenshots.

**Key Characteristics:**

- Full-width, tree-aligned waterfall until a span is selected.
- Quiet neutral chrome with color for identity and state.
- Geist interface text paired with Geist Mono measurements.

## Colors

### Primary

The near-white primary action reverses to dark text. Blue is reserved for focus, selection, and evidence links rather than a dominant page wash.

### Neutral

The background is the work surface. Slightly lighter search/axis, inspector, and dialog tones separate only necessary regions. Muted foreground supports metadata; neutral hairlines carry structure. There is no sidebar surface or default overview panel.

### Semantic

Destructive rose marks errors; normal status remains plain text, not a success badge. Service colors connect the waterfall, legend, inspector, and service table. Error rows also carry an alert icon; error bars override the service color. Do not confuse service identity with health status.

## Typography

Self-hosted Geist Variable supplies interface text. Geist Mono Variable supplies identifiers, operations, attributes, durations, and numeric measurements, with tabular numerals. There is no separate decorative display face.

The base is 13px; empty-state headings use the headline token and trace titles the title token. Buttons and view tabs are 12px; section headings are 12px at weight 500. Operation names are 11px mono, durations 10px mono, and summary measurements 13px mono. Trace titles become 16px at 600px and below. Long inspector values wrap; compact tree names ellipsize rather than disturbing row alignment.

## Layout

Desktop uses a single 52px header with brand, filename, Open file, and Share. A compact trace summary places title/ID beside inline Duration, Spans, Services, and Errors metrics. The 42px Waterfall/Analysis tab strip switches actual views. No sidebar, default overview, metric cards, or application footer is present. The empty state is an unboxed file picker with one short format hint, one action, and a size/privacy note; a dashed overlay appears only while dragging a file.

The waterfall fills the available width until selection opens a 360px inspector; closing it restores that width. Page gutters are 24px and inspector interiors 20px. Rows are 32px, the sticky axis 34px, and the table minimum width 700px. Operation/duration occupy `minmax(320px, 40%)`; the time axis uses the rest. A small waterfall-local legend and window readout remain below the rows.

Analysis uses flat findings and a service table in two columns, a 40px gap, and a 1440px maximum width. At 1100px and below, the inspector narrows to 320px, its toolbar wraps, and analysis becomes one column capped at 760px. At 900px and below, metrics wrap below the title, the inspector stacks below the waterfall, and waterfall scrolling is bounded to 60dvh with a 320px minimum height. At 600px and below, gutters become 16px, the header filename hides, and search occupies a full toolbar row. The waterfall and service table scroll horizontally rather than crush their columns.

## Elevation & Depth

The workspace is flat: tonal steps and one-pixel borders, not card shadows, separate regions. Selected spans gain a blue-charcoal row and a light outline around the corresponding timeline bar. Active tabs use a one-pixel light bottom rule, not a pill or raised container. Focus uses blue outlines or the primitive's translucent ring; this is state feedback, not decorative elevation.

## Shapes

Controls use restrained small corners (5px buttons, 6px inputs). Service markers are 6px squares with 1px corners; timeline bars are 10px high with 2px corners. The drag overlay uses 6px corners and the share dialog 8px. Findings and service rows use hairline separators, not floating rounded cards.

## Components

- **Buttons:** near-white primary; dark outlined secondary; ghost utilities. Application buttons use 12px text and the medium corner token. Disabled primitives reduce opacity and pointer interaction. Preserve hover, focus-visible, and pressed feedback.
- **Inputs:** 30px search with an inset icon and `/` hint, muted placeholder, and blue caret. Search suppresses the primitive's ring shadow and retains the focused border. Attribute fields retain primitive focus feedback. Invalid fields use destructive border/ring feedback.
- **View tabs:** Waterfall and Analysis switch mutually exclusive content; Analysis carries a quiet findings count. Transparent backgrounds, muted inactive labels, light active text and bottom rule. Inspector tabs repeat this treatment for Attributes, Events, and Links with counts.
- **Analysis:** findings are text rows with evidence links when available; instrumentation notes are collapsed disclosure text. Interpretation caveats appear once near Findings, not beneath every repeated operation. The Services table uses left-aligned service controls and right-aligned mono Spans, Self time, and Total columns. Selecting a service returns to its filtered waterfall.
- **Waterfall:** operation tree and duration align with an actual time axis. Service bars strengthen on hover/selection. Selecting a span retains tree context; focusing changes the visible time range and returns narrow-screen users from the stacked inspector to the timeline.
- **Inspector:** appears only after selection, with close control, service/name/ID, contextual measurements, Focus span/Go to parent actions, evidence tabs, attribute filter, and wrapping data. It is not a persistent overview placeholder.
- **Sharing dialog:** protected focus for an explicit publish decision, with lifetime, access warning, and confirmation. Never imply that an unlisted link is authenticated private storage.
- **Browser surfaces:** neutral 8px scrollbars, blue text selection, blue caret and visible focus. Timeline opacity transitions take 120ms; reduced motion removes transitions and smooth scrolling. There is no custom drop-target transition.

## Do's and Don'ts

### Do:

- **Do** preserve tree/time alignment and tabular measurements.
- **Do** keep neutral surfaces quiet and use color for identity or state.
- **Do** keep view switching explicit and preserve intentional table scrolling on narrow screens.

### Don't:

- **Don't** reintroduce dashboard scaffolding, onboarding steps, oversized cards, or explanatory filler.
- **Don't** use service color alone to communicate error status.
- **Don't** hide evidence behind decorative effects or imply unsupported root-cause certainty.
