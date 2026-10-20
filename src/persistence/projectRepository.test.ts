import { describe, it, expect, vi, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  createProjectRepository,
  DEFAULT_PROJECT_DB_NAME,
} from "./projectRepository";
import { createElement, createProject } from "@/project/defaults";
import { ProjectValidationError } from "@/project/validate";
import type { Project } from "@/project/model";

/**
 * Integration tests against fake-indexeddb. Every test uses a unique
 * database name, so tests are fully isolated and order-independent — no
 * shared database state and no cleanup required.
 */

let dbCounter = 0;

function makeRepository(): { repository: ReturnType<typeof createProjectRepository>; dbName: string } {
  dbCounter += 1;
  const dbName = `motionlab-test-${dbCounter}`;
  return { repository: createProjectRepository(dbName), dbName };
}

function makeProject(name: string, extraElements = 0): Project {
  return createProject({
    name,
    elements: [
      createElement("rect", { name: "Box" }),
      ...Array.from({ length: extraElements }, () => createElement("ellipse")),
    ],
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("projectRepository — put and get", () => {
  it("persists a project and retrieves it unchanged", async () => {
    const { repository } = makeRepository();
    const project = makeProject("Round trip");

    await repository.put(project);
    const loaded = await repository.get(project.id);

    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(project);
  });

  it("round-trips a project with keyframes and all element types", async () => {
    const { repository } = makeRepository();
    const project = createProject({
      name: "Animated",
      elements: [
        createElement("rect", {
          keyframes: [
            { id: "kf-1", property: "x", timeMs: 0, value: 0, easing: "linear" },
            {
              id: "kf-2",
              property: "x",
              timeMs: 1000,
              value: 100,
              easing: "ease-in",
            },
          ],
        }),
        createElement("text", { text: "Hello" }),
      ],
    });

    await repository.put(project);

    expect(await repository.get(project.id)).toEqual(project);
  });

  it("overwrites an existing project with the same id", async () => {
    const { repository } = makeRepository();
    const project = makeProject("Original");
    await repository.put(project);

    const updated = { ...project, name: "Renamed" };
    await repository.put(updated);

    expect(await repository.get(project.id)).toEqual(updated);
    expect(await repository.list()).toHaveLength(1);
  });

  it("resolves null for an unknown id", async () => {
    const { repository } = makeRepository();

    expect(await repository.get("no-such-id")).toBeNull();
  });
});

describe("projectRepository — list", () => {
  it("lists all stored projects across multiple ids", async () => {
    const { repository } = makeRepository();
    const projects = [
      makeProject("A"),
      makeProject("B", 2),
      makeProject("C"),
    ];
    for (const project of projects) {
      await repository.put(project);
    }

    const listed = await repository.list();

    expect(listed).toHaveLength(3);
    expect([...listed].sort((a, b) => a.name.localeCompare(b.name))).toEqual(
      projects,
    );
  });

  it("returns an empty list for an empty database", async () => {
    const { repository } = makeRepository();

    expect(await repository.list()).toEqual([]);
  });
});

describe("projectRepository — delete", () => {
  it("deletes a project so it is gone from get and list", async () => {
    const { repository } = makeRepository();
    const first = makeProject("Keep");
    const second = makeProject("Remove");
    await repository.put(first);
    await repository.put(second);

    await repository.delete(second.id);

    expect(await repository.get(second.id)).toBeNull();
    const listed = await repository.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toEqual(first);
  });

  it("resolves when deleting an id that does not exist", async () => {
    const { repository } = makeRepository();
    const project = makeProject("Keep");
    await repository.put(project);

    await expect(repository.delete("no-such-id")).resolves.toBeUndefined();
    expect(await repository.get(project.id)).toEqual(project);
  });
});

describe("projectRepository — persistence across calls and databases", () => {
  it("persists data across separate repository instances on the same database", async () => {
    dbCounter += 1;
    const dbName = `motionlab-test-${dbCounter}`;
    const project = makeProject("Shared");

    await createProjectRepository(dbName).put(project);
    const loaded = await createProjectRepository(dbName).get(project.id);

    expect(loaded).toEqual(project);
  });

  it("keeps databases with different names isolated", async () => {
    dbCounter += 1;
    const dbNameA = `motionlab-test-${dbCounter}`;
    dbCounter += 1;
    const dbNameB = `motionlab-test-${dbCounter}`;
    const projectA = makeProject("In A");

    await createProjectRepository(dbNameA).put(projectA);

    expect(await createProjectRepository(dbNameA).list()).toHaveLength(1);
    expect(await createProjectRepository(dbNameB).list()).toHaveLength(0);
  });

  it("uses the documented default database name when none is given", async () => {
    const repository = createProjectRepository();
    const project = makeProject("Default db");
    await repository.put(project);

    expect(
      await createProjectRepository(DEFAULT_PROJECT_DB_NAME).get(project.id),
    ).toEqual(project);
  });
});

describe("projectRepository — validation on read (T13)", () => {
  /** Seeds a record bypassing types: `put` stores documents as-is. */
  async function seed(dbName: string, records: unknown[]): Promise<void> {
    const repository = createProjectRepository(dbName);
    for (const record of records) {
      await repository.put(record as Project);
    }
  }

  it("valid records still round-trip through get and list", async () => {
    const { repository } = makeRepository();
    const project = makeProject("Valid");
    await repository.put(project);

    expect(await repository.get(project.id)).toEqual(project);
    expect(await repository.list()).toEqual([project]);
  });

  it("get rejects when the stored record has an unknown element type", async () => {
    const { repository, dbName } = makeRepository();
    const project = makeProject("Broken type");
    const invalid = {
      ...project,
      elements: [{ ...project.elements[0], type: "triangle" }],
    };
    await seed(dbName, [invalid]);

    await expect(repository.get(project.id)).rejects.toThrow(
      /Invalid stored project record/,
    );
  });

  it("get rejects with validation details preserved as the cause", async () => {
    const { repository, dbName } = makeRepository();
    const project = makeProject("Broken keyframe");
    const invalid = {
      ...project,
      elements: [
        {
          ...project.elements[0],
          keyframes: [
            { id: "kf", property: "x", timeMs: 1.5, value: 0, easing: "linear" },
          ],
        },
      ],
    };
    await seed(dbName, [invalid]);

    const error = await repository.get(project.id).then(
      () => {
        throw new Error("expected rejection");
      },
      (rejection: Error) => rejection,
    );
    expect(error.message).toMatch(/Invalid stored project record/);
    const cause = error.cause as ProjectValidationError;
    expect(cause).toBeInstanceOf(ProjectValidationError);
    expect(cause.issues.join(" ")).toContain("timeMs must be an integer");
  });

  it("get rejects when required fields are missing", async () => {
    const { repository, dbName } = makeRepository();
    const project = makeProject("Missing fields");
    const invalid = { ...project };
    delete (invalid as Record<string, unknown>).canvas;
    await seed(dbName, [invalid]);

    const error = await repository.get(project.id).then(
      () => {
        throw new Error("expected rejection");
      },
      (rejection: Error) => rejection,
    );
    expect(error.message).toMatch(/Invalid stored project record/);
    expect((error.cause as ProjectValidationError).issues).toContainEqual(
      "project.canvas must be an object",
    );
  });

  it("list rejects when any stored record is invalid instead of skipping it", async () => {
    dbCounter += 1;
    const dbName = `motionlab-test-list-${dbCounter}`;
    const repository = createProjectRepository(dbName);
    const valid = makeProject("Valid");
    const invalid = {
      ...makeProject("Invalid"),
      durationMs: 0,
    };
    await seed(dbName, [valid, invalid]);

    await expect(repository.list()).rejects.toThrow(
      /Invalid stored project record/,
    );
  });

  it("get still resolves null for a missing id after validation is wired", async () => {
    const { repository } = makeRepository();

    expect(await repository.get("no-such-id")).toBeNull();
  });
});

describe("projectRepository — error handling", () => {
  it("rejects when the database cannot be opened", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        const request = {} as IDBOpenDBRequest;
        queueMicrotask(() => {
          request.onerror?.(new Event("error"));
        });
        return request;
      },
    });
    const repository = createProjectRepository("failing-open-db");

    await expect(repository.list()).rejects.toThrow(/Failed to open/);
    await expect(repository.get("any")).rejects.toThrow(/Failed to open/);
  });

  it("rejects when the transaction cannot be created", async () => {
    const close = vi.fn();
    vi.stubGlobal("indexedDB", {
      open: () => {
        const request = {} as IDBOpenDBRequest;
        queueMicrotask(() => {
          Object.defineProperty(request, "result", {
            value: {
              objectStoreNames: { contains: () => true },
              transaction: () => {
                throw new Error("no transaction available");
              },
              close,
            },
          });
          request.onsuccess?.(new Event("success"));
        });
        return request;
      },
    });
    const repository = createProjectRepository("failing-tx-db");

    await expect(repository.put(makeProject("X"))).rejects.toThrow(
      /no transaction available/,
    );
  });

  it("rejects when the transaction aborts", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        const request = {} as IDBOpenDBRequest;
        queueMicrotask(() => {
          Object.defineProperty(request, "result", {
            value: {
              objectStoreNames: { contains: () => true },
              transaction: () => {
                const tx = {
                  objectStore: () => ({
                    getAll: () => ({}),
                  }),
                  onerror: null,
                  onabort: null,
                  error: new Error("aborted by quota"),
                } as unknown as IDBTransaction;
                queueMicrotask(() => tx.onabort?.(new Event("abort")));
                return tx;
              },
              close: vi.fn(),
            },
          });
          request.onsuccess?.(new Event("success"));
        });
        return request;
      },
    });
    const repository = createProjectRepository("aborting-db");

    await expect(repository.list()).rejects.toThrow(/aborted/);
  });
});
