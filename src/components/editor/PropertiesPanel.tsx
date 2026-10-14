/**
 * Right properties/inspector panel (T3). Empty state only — element
 * inspection and editing arrive with T6.
 */

const EMPTY_SECTIONS = ["Transform", "Appearance"] as const;

export default function PropertiesPanel() {
  return (
    <aside
      aria-label="Properties"
      className="w-full shrink-0 border-t border-neutral-800 bg-neutral-900 lg:w-72 lg:border-l lg:border-t-0"
    >
      <div className="flex h-full flex-col">
        <h2 className="border-b border-neutral-800 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Properties
        </h2>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <p className="text-xs leading-5 text-neutral-500">
            Nothing selected. Add an element to inspect its properties.
          </p>
          {/* Structural placeholder sections; real fields arrive with T6. */}
          {EMPTY_SECTIONS.map((section) => (
            <div key={section} className="space-y-1">
              <h3 className="text-xs font-medium text-neutral-400">
                {section}
              </h3>
              <p className="text-xs text-neutral-600">&mdash;</p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
