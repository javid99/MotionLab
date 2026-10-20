import type { ProjectRepository } from "@/persistence/projectRepository";
import type { Project } from "@/project/model";

/**
 * In-memory `ProjectRepository` for isolated UI tests: deterministic, no
 * IndexedDB, and records are cloned on write/read so callers cannot share
 * mutable references with the "persisted" data.
 */
export function createMemoryProjectRepository(
  initial: Project[] = [],
): ProjectRepository & { projects: Map<string, Project> } {
  const projects = new Map<string, Project>(
    initial.map((project) => [project.id, structuredClone(project)]),
  );
  return {
    projects,
    put: async (project) => {
      projects.set(project.id, structuredClone(project));
    },
    get: async (id) => {
      const project = projects.get(id);
      return project ? structuredClone(project) : null;
    },
    list: async () =>
      [...projects.values()].map((project) => structuredClone(project)),
    delete: async (id) => {
      projects.delete(id);
    },
  };
}
