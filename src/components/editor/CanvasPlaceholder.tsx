"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useEditorStore } from "@/editor/editorStore";
import { useProjectStore } from "@/editor/projectStore";
import { evaluate } from "@/engine/evaluator";
import { screenToScene, type Point } from "@/lib/coords";
import {
  getElementSize,
  TEXT_HEIGHT_FACTOR,
  type Size,
} from "@/lib/elementTransform";
import type {
  EvaluatedScene,
  Project,
  SceneElement,
  Transform,
} from "@/project/model";
import SceneRenderer from "@/render/SceneRenderer";

/**
 * Interactive canvas region (T6): renders the current project through the
 * prop-driven SceneRenderer and supports click-select, drag-move, and
 * corner-handle resize for the selected element. In-flight drag state is
 * component-local and transient; the project store is written only when the
 * gesture commits on pointer-up. The rendered scene is the engine's
 * `evaluate(project, playheadMs)` output (not the base transform), so
 * keyframes authored in the properties panel or timeline are visible on the
 * canvas while scrubbing/playing. All coordinate-space conversion goes
 * through `src/lib/coords.ts`.
 */

interface MoveDrag {
  kind: "move";
  id: string;
  startScene: Point;
  base: Transform;
  currentScene: Point;
}

interface ResizeDrag {
  kind: "resize";
  id: string;
  startScene: Point;
  baseSize: Size;
  currentScene: Point;
}

type DragState = MoveDrag | ResizeDrag | null;

function withGeometry(element: SceneElement, size: Size): SceneElement {
  switch (element.type) {
    case "rect":
      return { ...element, width: size.width, height: size.height };
    case "ellipse":
      return { ...element, rx: size.width / 2, ry: size.height / 2 };
    case "text":
      return { ...element, fontSize: size.height / TEXT_HEIGHT_FACTOR };
  }
}

function committedSize(drag: ResizeDrag): Size {
  const width = drag.baseSize.width + (drag.currentScene.x - drag.startScene.x);
  const height =
    drag.baseSize.height + (drag.currentScene.y - drag.startScene.y);
  // Guard against degenerate events producing non-finite geometry.
  return {
    width: Number.isFinite(width) ? Math.max(1, width) : drag.baseSize.width,
    height: Number.isFinite(height)
      ? Math.max(1, height)
      : drag.baseSize.height,
  };
}

export default function CanvasPlaceholder() {
  const project = useProjectStore((s) => s.project);
  const updateElement = useProjectStore((s) => s.updateElement);
  const setAnimatableValue = useProjectStore((s) => s.setAnimatableValue);
  const selectedId = useEditorStore((s) => s.selectedElementId);
  const select = useEditorStore((s) => s.select);
  const view = useEditorStore((s) => s.view);
  const playheadMs = useEditorStore((s) => s.playheadMs);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState>(null);

  const canvasWidth = project.canvas.width;
  const canvasHeight = project.canvas.height;

  const moveOverride =
    drag?.kind === "move"
      ? {
          id: drag.id,
          transform: {
            ...drag.base,
            x: drag.base.x + (drag.currentScene.x - drag.startScene.x),
            y: drag.base.y + (drag.currentScene.y - drag.startScene.y),
          },
        }
      : undefined;

  const displayProject: Project =
    drag?.kind === "resize"
      ? {
          ...project,
          elements: project.elements.map((el) =>
            el.id === drag.id ? withGeometry(el, committedSize(drag)) : el,
          ),
        }
      : project;
  const evaluatedScene = evaluate(displayProject, playheadMs);
  const displayScene: EvaluatedScene = moveOverride
    ? {
        ...evaluatedScene,
        elements: evaluatedScene.elements.map((el) =>
          el.id === moveOverride.id
            ? { ...el, transform: { ...moveOverride.transform } }
            : el,
        ),
      }
    : evaluatedScene;

  const selectedDisplay = selectedId
    ? displayProject.elements.find((el) => el.id === selectedId)
    : undefined;
  const selectedSceneElement = selectedId
    ? displayScene.elements.find((el) => el.id === selectedId)
    : undefined;
  const selectedSize = selectedDisplay
    ? getElementSize(selectedDisplay)
    : undefined;

  function clientToScreen(event: ReactPointerEvent): Point {
    const rect = surfaceRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  }

  function capturePointer(event: ReactPointerEvent): void {
    try {
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    } catch {
      // jsdom does not implement pointer capture; tests dispatch events
      // directly on the surface, so the drag still works there.
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    const target = event.target as Element;
    const scenePoint = screenToScene(clientToScreen(event), view);

    const resizeId = target
      .closest("[data-resize-handle]")
      ?.getAttribute("data-resize-handle");
    if (resizeId) {
      const element = project.elements.find((el) => el.id === resizeId);
      if (element) {
        setDrag({
          kind: "resize",
          id: element.id,
          startScene: scenePoint,
          baseSize: getElementSize(element),
          currentScene: scenePoint,
        });
        capturePointer(event);
        return;
      }
    }

    const elementId = target
      .closest("[data-element-id]")
      ?.getAttribute("data-element-id");
    if (elementId) {
      const element = project.elements.find((el) => el.id === elementId);
      select(elementId);
      if (element) {
        // The drag starts from the value currently on screen (the evaluated
        // value at the playhead), not the masked base transform.
        const evaluated = evaluate(project, playheadMs).elements.find(
          (el) => el.id === element.id,
        );
        setDrag({
          kind: "move",
          id: element.id,
          startScene: scenePoint,
          base: evaluated
            ? { ...evaluated.transform }
            : { ...element.transform },
          currentScene: scenePoint,
        });
        capturePointer(event);
      }
      return;
    }

    select(null);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!drag) {
      return;
    }
    setDrag({ ...drag, currentScene: screenToScene(clientToScreen(event), view) });
  }

  function handlePointerUp(): void {
    if (!drag) {
      return;
    }
    if (drag.kind === "move") {
      const dx = drag.currentScene.x - drag.startScene.x;
      const dy = drag.currentScene.y - drag.startScene.y;
      // A click-select without movement must not commit (and must not create
      // a keyframe on an already-animated property).
      if (dx !== 0 || dy !== 0) {
        const timeMs = Math.round(playheadMs);
        setAnimatableValue(drag.id, "x", drag.base.x + dx, timeMs);
        setAnimatableValue(drag.id, "y", drag.base.y + dy, timeMs);
      }
    } else {
      const size = committedSize(drag);
      const element = project.elements.find((el) => el.id === drag.id);
      if (element) {
        switch (element.type) {
          case "rect":
            updateElement(element.id, {
              width: size.width,
              height: size.height,
            });
            break;
          case "ellipse":
            updateElement(element.id, {
              rx: size.width / 2,
              ry: size.height / 2,
            });
            break;
          case "text":
            updateElement(element.id, {
              fontSize: size.height / TEXT_HEIGHT_FACTOR,
            });
            break;
        }
      }
    }
    setDrag(null);
  }

  return (
    <section
      aria-label="Canvas"
      className="relative flex min-h-[16rem] min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, #333333 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="relative flex flex-1 items-start justify-center overflow-auto p-6">
        {project.elements.length === 0 ? (
          <div className="m-auto text-center">
            <p className="text-sm font-medium text-neutral-400">Canvas</p>
            <p className="mt-1 text-xs text-neutral-500">
              Use the Rect, Ellipse, or Text buttons in the toolbar above to
              add your first element.
            </p>
          </div>
        ) : (
          <div
            ref={surfaceRef}
            data-testid="canvas-surface"
            className="relative [&>svg]:block"
            style={{ width: canvasWidth, height: canvasHeight }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <SceneRenderer project={displayProject} scene={displayScene} />
            {selectedDisplay && selectedSceneElement && selectedSize ? (
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                width={canvasWidth}
                height={canvasHeight}
                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              >
                <rect
                  x={selectedSceneElement.transform.x}
                  y={selectedSceneElement.transform.y}
                  width={selectedSize.width}
                  height={selectedSize.height}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                />
                <rect
                  x={
                    selectedSceneElement.transform.x +
                    selectedSize.width -
                    4
                  }
                  y={
                    selectedSceneElement.transform.y +
                    selectedSize.height -
                    4
                  }
                  width={8}
                  height={8}
                  fill="#38bdf8"
                  className="pointer-events-auto cursor-nwse-resize"
                  data-resize-handle={selectedDisplay.id}
                />
              </svg>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
