/**
 * Bottom timeline strip (T3): empty state only. Tracks, keyframe editing,
 * and playback arrive with T10/T11.
 */
export default function TimelineStrip() {
  return (
    <section
      aria-label="Timeline"
      className="h-40 shrink-0 border-t border-neutral-800 bg-neutral-900"
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-neutral-800 px-4 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Timeline
          </h2>
        </div>
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-xs text-neutral-500">No keyframes yet.</p>
        </div>
      </div>
    </section>
  );
}
