import CanvasPlaceholder from "./CanvasPlaceholder";
import EditorToolbar from "./EditorToolbar";
import PropertiesPanel from "./PropertiesPanel";
import TimelineStrip from "./TimelineStrip";

/**
 * Static application shell (T3). Structural layout only: no project logic,
 * no store wiring, and no interactive behavior yet — interactive controls
 * arrive with later backlog tasks.
 */
export default function EditorShell() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-neutral-950 text-neutral-200">
      <EditorToolbar />
      <main
        aria-label="Editor workspace"
        className="flex min-h-0 flex-1 flex-col lg:flex-row"
      >
        <CanvasPlaceholder />
        <PropertiesPanel />
      </main>
      <TimelineStrip />
    </div>
  );
}
