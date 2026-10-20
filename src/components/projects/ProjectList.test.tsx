import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "fake-indexeddb/auto";
import ProjectList from "./ProjectList";
import {
  createProjectRepository,
  type ProjectRepository,
} from "@/persistence/projectRepository";
import { createElement, createProject } from "@/project/defaults";
import { useProjectStore } from "@/editor/projectStore";
import type { Project } from "@/project/model";

/**
 * Integration tests: the real repository backed by fake-indexeddb, with a
 * unique database per test (isolation without mocks). This exercises the
 * actual persistence + runtime-validation path the screen uses in production.
 */

let dbCounter = 0;

function makeSetup(): {
  repository: ProjectRepository;
  verify: ProjectRepository;
} {
  dbCounter += 1;
  const dbName = `motionlab-projectlist-${dbCounter}`;
  const repository = createProjectRepository(dbName);
  return { repository, verify: createProjectRepository(dbName) };
}

async function seed(repository: ProjectRepository, projects: Project[]): Promise<void> {
  for (const project of projects) {
    await repository.put(project);
  }
}

function makeProject(name: string): Project {
  return createProject({
    name,
    elements: [createElement("rect", { name: "Box" })],
  });
}

beforeEach(() => {
  useProjectStore.setState({ project: createProject() });
});

describe("ProjectList — loading, empty, and list states", () => {
  it("shows a loading state before the list resolves", async () => {
    const { repository } = makeSetup();
    render(<ProjectList repository={repository} />);

    expect(screen.getByTestId("projects-loading")).toBeInTheDocument();
    await screen.findByText("No projects yet.");
  });

  it("renders saved projects from the repository with Open links", async () => {
    const { repository } = makeSetup();
    const project = makeProject("Intro animation");
    await seed(repository, [project]);
    render(<ProjectList repository={repository} />);

    const item = await screen.findByText("Intro animation");
    expect(item).toBeInTheDocument();

    const openLink = screen.getByRole("link", { name: "Open Intro animation" });
    expect(openLink).toHaveAttribute("href", `/editor?id=${project.id}`);
    expect(screen.getByText("1 element")).toBeInTheDocument();
  });

  it("shows an intentional empty state when no projects exist", async () => {
    const { repository } = makeSetup();
    render(<ProjectList repository={repository} />);

    expect(await screen.findByTestId("projects-empty")).toHaveTextContent(
      "No projects yet.",
    );
  });

  it("shows an error state and no fabricated data when a stored record is invalid", async () => {
    const { repository } = makeSetup();
    const project = makeProject("Broken");
    const invalid = {
      ...project,
      elements: [{ ...project.elements[0], type: "triangle" }],
    };
    await repository.put(invalid as Project);
    render(<ProjectList repository={repository} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(screen.queryByText("Broken")).toBeNull();
    expect(screen.getByRole("button", { name: "Retry loading projects" })).toBeInTheDocument();
  });

  it("does not mutate persisted project data while listing", async () => {
    const { repository, verify } = makeSetup();
    const project = makeProject("Untouched");
    await seed(repository, [project]);
    render(<ProjectList repository={repository} />);

    await screen.findByText("Untouched");
    await waitFor(async () => {
      expect(await verify.get(project.id)).toEqual(project);
    });
  });
});

describe("ProjectList — rename", () => {
  it("renames a project and persists the new name", async () => {
    const { repository, verify } = makeSetup();
    const project = makeProject("Original name");
    await seed(repository, [project]);
    render(<ProjectList repository={repository} />);

    fireEvent.click(await screen.findByRole("button", { name: "Rename Original name" }));
    const input = screen.getByLabelText("Project name");
    expect(input).toHaveValue("Original name");
    fireEvent.change(input, { target: { value: "Renamed project" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name for Original name" }));

    expect(await screen.findByText("Renamed project")).toBeInTheDocument();
    await waitFor(async () => {
      const stored = await verify.get(project.id);
      expect(stored?.name).toBe("Renamed project");
    });
  });

  it("does not persist an empty or whitespace-only name", async () => {
    const { repository, verify } = makeSetup();
    const project = makeProject("Keep name");
    await seed(repository, [project]);
    render(<ProjectList repository={repository} />);

    fireEvent.click(await screen.findByRole("button", { name: "Rename Keep name" }));
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name for Keep name" }));

    await screen.findByText("Keep name");
    expect((await verify.get(project.id))?.name).toBe("Keep name");
  });

  it("can cancel renaming", async () => {
    const { repository, verify } = makeSetup();
    const project = makeProject("Cancel me");
    await seed(repository, [project]);
    render(<ProjectList repository={repository} />);

    fireEvent.click(await screen.findByRole("button", { name: "Rename Cancel me" }));
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Changed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel renaming Cancel me" }));

    expect(screen.queryByLabelText("Project name")).toBeNull();
    expect((await verify.get(project.id))?.name).toBe("Cancel me");
  });
});

describe("ProjectList — duplicate", () => {
  it("duplicates a project with a new id, name, and timestamps", async () => {
    const { repository, verify } = makeSetup();
    const project = makeProject("Master");
    await seed(repository, [project]);
    render(<ProjectList repository={repository} />);

    fireEvent.click(await screen.findByRole("button", { name: "Duplicate Master" }));

    expect(await screen.findByText("Master copy")).toBeInTheDocument();
    const listed = await verify.list();
    expect(listed).toHaveLength(2);
    const copy = listed.find((p) => p.id !== project.id);
    expect(copy).toBeDefined();
    expect(copy?.name).toBe("Master copy");
    expect(copy?.elements).toEqual(project.elements);
    expect(copy?.createdAt).not.toBe(project.createdAt);
  });
});

describe("ProjectList — delete", () => {
  it("deletes a project and removes it from the list and repository", async () => {
    const { repository, verify } = makeSetup();
    const project = makeProject("Doomed");
    await seed(repository, [project]);
    render(<ProjectList repository={repository} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Doomed" }));

    expect(await screen.findByTestId("projects-empty")).toBeInTheDocument();
    expect(await verify.get(project.id)).toBeNull();
  });

  it("handles deleting the current editor project gracefully", async () => {
    const { repository } = makeSetup();
    const project = makeProject("Currently open");
    await seed(repository, [project]);
    // The editor's persistent store currently holds this project.
    useProjectStore.setState({ project });
    render(<ProjectList repository={repository} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Currently open" }));

    await screen.findByTestId("projects-empty");
    // The stale document is replaced, not left pointing at deleted data.
    expect(useProjectStore.getState().project.id).not.toBe(project.id);
    expect(useProjectStore.getState().project.name).toBe("Untitled project");
  });

  it("leaves the editor store alone when deleting an unrelated project", async () => {
    const { repository } = makeSetup();
    const current = makeProject("Current");
    useProjectStore.setState({ project: current });
    const other = makeProject("Other");
    await seed(repository, [other]);
    render(<ProjectList repository={repository} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete Other" }));

    await screen.findByTestId("projects-empty");
    expect(useProjectStore.getState().project.id).toBe(current.id);
  });
});

describe("ProjectList — accessibility", () => {
  it("labels every action with the project name", async () => {
    const { repository } = makeSetup();
    const project = makeProject("Accessible");
    await seed(repository, [project]);
    render(<ProjectList repository={repository} />);

    const list = await screen.findByRole("list");
    const item = within(list).getByRole("listitem");
    for (const name of [
      `Open ${project.name}`,
      `Rename ${project.name}`,
      `Duplicate ${project.name}`,
      `Delete ${project.name}`,
    ]) {
      expect(within(item).getByRole(name.startsWith("Open") ? "link" : "button", { name })).toBeInTheDocument();
    }
  });
});
