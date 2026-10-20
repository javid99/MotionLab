import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "fake-indexeddb/auto";
import EditorPage from "./EditorPage";
import { createProjectRepository, type ProjectRepository } from "@/persistence/projectRepository";
import { createElement, createProject } from "@/project/defaults";
import { useProjectStore } from "@/editor/projectStore";
import type { Project } from "@/project/model";

/**
 * Editor route behavior (T14): the `?id=` query selects the project to open.
 * Navigation is mocked (Next.js App Router context is not available under
 * jsdom); the repository path is real (fake-indexeddb, unique db per test).
 */

const navigation = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

let dbCounter = 0;

function makeSetup(): { repository: ProjectRepository; dbName: string } {
  dbCounter += 1;
  const dbName = `motionlab-editorpage-${dbCounter}`;
  return { repository: createProjectRepository(dbName), dbName };
}

async function seed(repository: ProjectRepository, project: Project): Promise<void> {
  await repository.put(project);
}

beforeEach(() => {
  navigation.search = "";
  useProjectStore.setState({ project: createProject() });
});

describe("EditorPage — opening projects", () => {
  it("shows a loading state while the project is being fetched", () => {
    navigation.search = "id=some-id";
    render(<EditorPage />);

    expect(screen.getByTestId("editor-loading")).toBeInTheDocument();
  });

  it("loads the requested project into the editor store", async () => {
    const { repository } = makeSetup();
    const project = createProject({
      name: "Opened project",
      elements: [createElement("rect", { name: "Box" })],
    });
    await seed(repository, project);
    navigation.search = `id=${project.id}`;

    render(<EditorPage repository={repository} />);

    await waitFor(() => {
      expect(useProjectStore.getState().project.id).toBe(project.id);
    });
    expect(useProjectStore.getState().project.name).toBe("Opened project");
    // The editor shell renders with the opened document.
    expect(screen.getByText("Opened project")).toBeInTheDocument();
    expect(screen.queryByTestId("editor-loading")).toBeNull();
  });

  it("falls back to a fresh untitled project when the id is unknown (graceful)", async () => {
    const { repository } = makeSetup();
    navigation.search = "id=missing-project";

    render(<EditorPage repository={repository} />);

    await waitFor(() => {
      expect(screen.queryByTestId("editor-loading")).toBeNull();
    });
    const state = useProjectStore.getState();
    expect(state.project.id).not.toBe("missing-project");
    expect(state.project.name).toBe("Untitled project");
  });

  it("falls back to a fresh project when the stored record fails validation", async () => {
    const { repository } = makeSetup();
    const project = createProject({ name: "Corrupt" });
    const invalid = {
      ...project,
      elements: [{ ...project.elements[0], type: "triangle" }],
    };
    await repository.put(invalid as Project);
    navigation.search = `id=${project.id}`;

    render(<EditorPage repository={repository} />);

    await waitFor(() => {
      expect(screen.queryByTestId("editor-loading")).toBeNull();
    });
    expect(useProjectStore.getState().project.id).not.toBe(project.id);
    expect(useProjectStore.getState().project.name).toBe("Untitled project");
  });

  it("opens the editor directly when no id is given", () => {
    navigation.search = "";
    render(<EditorPage />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.queryByTestId("editor-loading")).toBeNull();
  });
});
