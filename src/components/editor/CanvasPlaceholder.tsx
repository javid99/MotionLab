/**
 * Canvas area placeholder (T3): visually distinct dark surface with a
 * restrained dot grid. Real SVG rendering arrives with T5.
 */
export default function CanvasPlaceholder() {
  return (
    <section
      aria-label="Canvas"
      className="relative flex min-h-[16rem] min-w-0 flex-1 items-center justify-center overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, #333333 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="relative px-4 text-center">
        <p className="text-sm font-medium text-neutral-400">Canvas</p>
        <p className="mt-1 text-xs text-neutral-500">
          Add elements to start composing your scene.
        </p>
      </div>
    </section>
  );
}
