import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SceneRenderer from "./SceneRenderer";
import { createElement, createProject } from "@/project/defaults";
import type {
  EvaluatedElement,
  EvaluatedScene,
  Project,
  SceneElement,
  Transform,
} from "@/project/model";

const CANVAS = { width: 1280, height: 720, fps: 30 };

function makeTransform(overrides: Partial<Transform> = {}): Transform {
  return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...overrides };
}

function makeFixture(): {
  project: Project;
  scene: EvaluatedScene;
  rect: { id: string; size: { width: number; height: number } };
} {
  const rect = createElement("rect", {
    name: "Box",
    width: 100,
    height: 100,
    style: { fill: "#ff0000", opacity: 1 },
  });
  const ellipse = createElement("ellipse", {
    name: "Dot",
    rx: 30,
    ry: 45,
    style: { fill: "#00ff00", opacity: 1 },
  });
  const text = createElement("text", {
    name: "Label",
    text: "Hello",
    fontSize: 16,
    fontFamily: "sans-serif",
    fontWeight: "400",
    style: { fill: "#0000ff", opacity: 1 },
  });
  const project = createProject({
    canvas: CANVAS,
    elements: [rect, ellipse, text],
  });

  const evaluated = (
    element: SceneElement,
    overrides: Partial<EvaluatedElement> = {},
  ): EvaluatedElement => ({
    id: element.id,
    type: element.type,
    visible: true,
    transform: makeTransform(),
    opacity: 1,
    ...overrides,
  });

  const scene: EvaluatedScene = {
    timeMs: 0,
    elements: [
      evaluated(rect, {
        transform: makeTransform({ x: 100, y: 50, rotation: 90, scaleX: 2 }),
      }),
      evaluated(ellipse, { opacity: 0.35 }),
      evaluated(text),
    ],
  };

  return {
    project,
    scene,
    rect: { id: rect.id, size: { width: 100, height: 100 } },
  };
}

function findElement(id: string): Element {
  const el = document.querySelector(`[data-element-id="${id}"]`);
  if (!el) throw new Error(`element ${id} not rendered`);
  return el;
}

/**
 * Applies the composed SVG transform list (T1·R·S·T2) to a point, honoring
 * SVG semantics: transforms apply right-to-left.
 */
function applyTransformString(str: string, p: { x: number; y: number }) {
  const tokens = str.match(/(translate|rotate|scale)\(([^)]+)\)/g);
  if (!tokens) throw new Error(`unparseable transform: ${str}`);
  let { x, y } = p;
  for (const token of tokens.reverse()) {
    const args = token
      .slice(token.indexOf("(") + 1, -1)
      .split(/[\s,]+/)
      .map(Number);
    if (token.startsWith("translate")) {
      x += args[0];
      y += args[1];
    } else if (token.startsWith("scale")) {
      x *= args[0];
      y *= args[1];
    } else {
      const rad = (args[0] * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      // Clockwise rotation in a y-down coordinate system.
      const rotatedX = x * cos - y * sin;
      const rotatedY = x * sin + y * cos;
      x = rotatedX;
      y = rotatedY;
    }
  }
  return { x, y };
}

describe("SceneRenderer — SVG viewport", () => {
  it("renders the SVG root with the project canvas dimensions", () => {
    const { project, scene } = makeFixture();
    render(<SceneRenderer project={project} scene={scene} />);

    const svg = screen.getByRole("img", { name: "Scene canvas" });
    expect(svg.getAttribute("width")).toBe("1280");
    expect(svg.getAttribute("height")).toBe("720");
    expect(svg.getAttribute("viewBox")).toBe("0 0 1280 720");
  });
});

describe("SceneRenderer — element types (exhaustive)", () => {
  it("renders a rect with geometry and style attributes", () => {
    const { project, scene, rect } = makeFixture();
    render(<SceneRenderer project={project} scene={scene} />);

    const el = findElement(rect.id);
    expect(el.tagName).toBe("rect");
    expect(el.getAttribute("width")).toBe("100");
    expect(el.getAttribute("height")).toBe("100");
    expect(el.getAttribute("rx")).toBe("0");
    expect(el.getAttribute("ry")).toBe("0");
    expect(el.getAttribute("fill")).toBe("#ff0000");
  });

  it("renders an ellipse drawn about its local center", () => {
    const { project, scene } = makeFixture();
    render(<SceneRenderer project={project} scene={scene} />);

    const el = findElement(
      scene.elements[1].id,
    );
    expect(el.tagName).toBe("ellipse");
    expect(el.getAttribute("cx")).toBe("30");
    expect(el.getAttribute("cy")).toBe("45");
    expect(el.getAttribute("rx")).toBe("30");
    expect(el.getAttribute("ry")).toBe("45");
    expect(el.getAttribute("fill")).toBe("#00ff00");
  });

  it("renders text with content and typography attributes", () => {
    const { project, scene } = makeFixture();
    render(<SceneRenderer project={project} scene={scene} />);

    const el = findElement(scene.elements[2].id);
    expect(el.tagName).toBe("text");
    expect(el.textContent).toBe("Hello");
    // React normalizes camelCase SVG props to hyphenated attributes.
    expect(el.getAttribute("font-family")).toBe("sans-serif");
    expect(el.getAttribute("font-size")).toBe("16");
    expect(el.getAttribute("font-weight")).toBe("400");
    expect(el.getAttribute("fill")).toBe("#0000ff");
  });
});

describe("SceneRenderer — visibility and opacity", () => {
  it("does not render invisible elements", () => {
    const { project, scene, rect } = makeFixture();
    const hidden: EvaluatedScene = {
      ...scene,
      elements: scene.elements.map((el, i) =>
        i === 0 ? { ...el, visible: false } : el,
      ),
    };
    render(<SceneRenderer project={project} scene={hidden} />);

    expect(document.querySelector(`[data-element-id="${rect.id}"]`)).toBeNull();
  });

  it("applies evaluated opacity as an attribute", () => {
    const { project, scene } = makeFixture();
    render(<SceneRenderer project={project} scene={scene} />);

    const el = findElement(scene.elements[1].id);
    expect(el.getAttribute("opacity")).toBe("0.35");
  });
});

describe("SceneRenderer — transform semantics", () => {
  it("composes the canonical translate → rotate → scale about the element center", () => {
    const { project, scene, rect } = makeFixture();
    render(<SceneRenderer project={project} scene={scene} />);

    const el = findElement(rect.id);
    expect(el.getAttribute("transform")).toBe(
      "translate(150 100) rotate(90) scale(2 1) translate(-50 -50)",
    );
  });

  it("places the local element center at the absolute center", () => {
    const { project, scene, rect } = makeFixture();
    render(<SceneRenderer project={project} scene={scene} />);

    const transform = findElement(rect.id).getAttribute("transform") ?? "";
    const center = applyTransformString(transform, {
      x: rect.size.width / 2,
      y: rect.size.height / 2,
    });
    // The element's center must sit at (x + w/2, y + h/2) regardless of
    // rotation and scale.
    expect(center.x).toBeCloseTo(100 + rect.size.width / 2, 9);
    expect(center.y).toBeCloseTo(50 + rect.size.height / 2, 9);
  });

  it("orbits the element top-left around the center under rotate and scale", () => {
    const { project, scene, rect } = makeFixture();
    render(<SceneRenderer project={project} scene={scene} />);

    const transform = findElement(rect.id).getAttribute("transform") ?? "";
    // Local top-left (0,0): translate(-50,-50) → scale(2,1) → rotate(90° cw)
    // → translate(150,100) = (150,100) + (50,-100) = (200, 0).
    const topLeft = applyTransformString(transform, { x: 0, y: 0 });
    expect(topLeft.x).toBeCloseTo(200, 9);
    expect(topLeft.y).toBeCloseTo(0, 9);
  });

  it("reduces to translate(x, y) for unrotated, unscaled elements", () => {
    const project = createProject({
      canvas: CANVAS,
      elements: [createElement("ellipse", { rx: 25, ry: 25 })],
    });
    const scene: EvaluatedScene = {
      timeMs: 0,
      elements: [
        {
          id: project.elements[0].id,
          type: "ellipse",
          visible: true,
          transform: makeTransform({ x: 40, y: 60 }),
          opacity: 1,
        },
      ],
    };
    render(<SceneRenderer project={project} scene={scene} />);

    const el = findElement(project.elements[0].id);
    expect(el.getAttribute("transform")).toBe(
      "translate(65 85) rotate(0) scale(1 1) translate(-25 -25)",
    );
  });
});
