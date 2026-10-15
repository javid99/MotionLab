import type {
  EvaluatedElement,
  EvaluatedScene,
  Project,
  SceneElement,
} from "@/project/model";
import { composeElementTransform, getElementSize } from "@/lib/elementTransform";

/**
 * SVG scene renderer (T5). Prop-driven and pure: consumes the evaluated
 * scene produced by the engine (evaluation itself happens before render —
 * no animation math here) plus the `Project` for static geometry and style.
 * No store imports; element types are handled through an exhaustive switch.
 */

export interface SceneRendererProps {
  /** Static geometry and style (fill); matched to the scene by element id. */
  project: Project;
  /** Fully evaluated element values at the current time. */
  scene: EvaluatedScene;
}

export default function SceneRenderer({
  project,
  scene,
}: SceneRendererProps) {
  const geometryById = new Map<string, SceneElement>(
    project.elements.map((element) => [element.id, element]),
  );

  return (
    <svg
      role="img"
      aria-label="Scene canvas"
      width={project.canvas.width}
      height={project.canvas.height}
      viewBox={`0 0 ${project.canvas.width} ${project.canvas.height}`}
      data-testid="scene-svg"
    >
      {scene.elements.map((evaluated) => {
        const element = geometryById.get(evaluated.id);
        // Invisible elements are not rendered at all.
        if (!element || !evaluated.visible) {
          return null;
        }
        return renderElement(element, evaluated);
      })}
    </svg>
  );
}

function renderElement(
  element: SceneElement,
  evaluated: EvaluatedElement,
): React.ReactElement | null {
  const transform = composeElementTransform(
    evaluated.transform,
    getElementSize(element),
  );
  const common = {
    transform,
    opacity: evaluated.opacity,
    "data-element-id": evaluated.id,
  };

  switch (element.type) {
    case "rect":
      return (
        <rect
          key={element.id}
          {...common}
          x={0}
          y={0}
          width={element.width}
          height={element.height}
          rx={element.cornerRadius}
          ry={element.cornerRadius}
          fill={element.style.fill}
        />
      );
    case "ellipse":
      return (
        <ellipse
          key={element.id}
          {...common}
          // Drawn about the local center so the local bounding box is
          // [0, 2rx] × [0, 2ry], matching the top-left anchor convention.
          cx={element.rx}
          cy={element.ry}
          rx={element.rx}
          ry={element.ry}
          fill={element.style.fill}
        />
      );
    case "text":
      return (
        <text
          key={element.id}
          {...common}
          x={0}
          // Baseline approximation inside the deterministic 1.2em text box.
          y={element.fontSize}
          fill={element.style.fill}
          fontFamily={element.fontFamily}
          fontSize={element.fontSize}
          fontWeight={element.fontWeight}
        >
          {element.text}
        </text>
      );
  }
}
