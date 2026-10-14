/**
 * Top toolbar strip (T3). The tool chips below are structural placeholders:
 * they are deliberately non-interactive (plain spans, not buttons) until
 * real tool behavior arrives in later tasks.
 */

const TOOLS = ["Select", "Move", "Rect", "Ellipse", "Text"] as const;

function LogoMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="3"
        className="fill-neutral-700"
      />
      <circle cx="5.5" cy="10.5" r="2" className="fill-neutral-300" />
      <path
        d="M7.5 8.5 L11 5"
        stroke="#d4d4d4"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function EditorToolbar() {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 bg-neutral-900 px-4 py-2">
      <div className="flex items-center gap-2">
        <LogoMark />
        <span className="text-sm font-semibold tracking-tight text-neutral-100">
          MotionLab
        </span>
      </div>
      <div
        role="group"
        aria-label="Editor tools"
        className="flex flex-wrap items-center gap-1"
      >
        {TOOLS.map((tool) => (
          <span
            key={tool}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-400"
          >
            {tool}
          </span>
        ))}
      </div>
      {/* Documented factory default name; wired to the store in a later task. */}
      <span className="ml-auto text-xs text-neutral-500">Untitled project</span>
    </header>
  );
}
