# MotionLab — Product

MotionLab is a browser-based motion design editor. Users compose visual elements
on a canvas, animate their properties with keyframes, preview the animation in
real time, persist projects locally, and export animations as CSS keyframes.

## Target Users

Designers and frontend developers who want lightweight, code-friendly motion
design without a heavyweight tool.

## Core Capabilities

1. **Canvas & elements** — create, select, move, and resize visual elements
   (rect, ellipse, text) on an SVG canvas.
2. **Keyframe animation** — animate element properties (position, rotation,
   scale, opacity) over a timeline; easing is specified per keyframe and
   shapes the animation segment that starts at that keyframe.
3. **Playback** — play, pause, stop, and scrub a preview of the composed
   animation.
4. **Persistence** — save projects to IndexedDB; load, rename, duplicate, and
   delete them.
5. **Export** — generate a CSS `@keyframes` stylesheet that is
   property-value equivalent to the composed animation (see DECISIONS.md
   ADR-008 for the exact fidelity guarantee).

## Explicit Non-Goals (v1)

- No multiplayer / collaboration.
- No server-side accounts or cloud sync.
- No raster-image or video layers.
- No Lottie/GIF/MP4 export.
- No plugin system.
- No undo/redo (deferred beyond v1 — DECISIONS.md ADR-010).

## Success Criteria for v1

- A user can create an element, keyframe two of its properties, press play, and
  see a smooth preview (performance target: ~60 fps on the reference machine;
  measured per BACKLOG.md T20, not a hard launch gate).
- A saved project survives a full page reload.
- Exported CSS keyframes apply the same property values as the in-app
  animation at sampled times, verified by tests comparing export output with
  the engine evaluator (ADR-008). Pixel-perfect rendering equivalence is not
  guaranteed.
