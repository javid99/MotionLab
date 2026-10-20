"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  createProjectRepository,
  type ProjectRepository,
} from "@/persistence/projectRepository";
import { createProject } from "@/project/defaults";
import { createId } from "@/lib/id";
import type { Project } from "@/project/model";
import { useProjectStore } from "@/editor/projectStore";

/**
 * Landing project list (T14): open/rename/duplicate/delete projects through
 * the existing repository (reads are runtime-validated there — untrusted
 * records surface as an error state, never as fabricated data). Deleting the
 * project currently held by the editor's store resets the store so deleted
 * data cannot resurface ("deleting current project handled gracefully").
 */

const defaultRepository = createProjectRepository();

interface ProjectListProps {
  /** Test injection point; defaults to the real IndexedDB repository. */
  repository?: ProjectRepository;
}

export default function ProjectList({ repository: repositoryProp }: ProjectListProps = {}) {
  const repository = repositoryProp ?? defaultRepository;
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const load = useCallback(async (): Promise<void> => {
    try {
      const list = await repository.list();
      setProjects(list);
      setError(null);
    } catch (cause) {
      setProjects([]);
      setError(
        cause instanceof Error ? cause.message : "Failed to load projects",
      );
    }
  }, [repository]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await repository.list();
        if (!cancelled) {
          setProjects(list);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled) {
          setProjects([]);
          setError(
            cause instanceof Error
              ? cause.message
              : "Failed to load projects",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  async function commitRename(project: Project): Promise<void> {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name || name === project.name) {
      return;
    }
    await repository.put({
      ...project,
      name,
      updatedAt: new Date().toISOString(),
    });
    await load();
  }

  async function duplicate(project: Project): Promise<void> {
    const now = new Date().toISOString();
    await repository.put({
      ...structuredClone(project),
      id: createId(),
      name: `${project.name} copy`,
      createdAt: now,
      updatedAt: now,
    });
    await load();
  }

  async function remove(project: Project): Promise<void> {
    await repository.delete(project.id);
    if (useProjectStore.getState().project.id === project.id) {
      useProjectStore.setState({ project: createProject() });
    }
    await load();
  }

  return (
    <main
      aria-label="Projects"
      className="mx-auto w-full max-w-2xl px-6 py-10"
    >
      <h1 className="text-lg font-semibold tracking-tight text-neutral-100">
        MotionLab
      </h1>
      <p className="mt-1 text-xs text-neutral-500">Your motion design projects</p>

      {error !== null ? (
        <div
          role="alert"
          data-testid="projects-error"
          className="mt-6 rounded-lg border border-red-900/60 bg-red-950/30 p-4"
        >
          <p className="text-sm text-red-300">Failed to load projects</p>
          <p className="mt-1 text-xs text-red-400/80">{error}</p>
          <button
            type="button"
            aria-label="Retry loading projects"
            onClick={() => {
              void load();
            }}
            className="mt-3 rounded-md border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
          >
            Retry
          </button>
        </div>
      ) : projects === null ? (
        <p className="mt-6 text-sm text-neutral-400" data-testid="projects-loading">
          Loading projects&hellip;
        </p>
      ) : projects.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-400" data-testid="projects-empty">
          No projects yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
            >
              {renamingId === project.id ? (
                <form
                  className="flex flex-1 flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void commitRename(project);
                  }}
                >
                  <input
                    aria-label="Project name"
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    autoFocus
                    className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-100 focus:border-sky-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    aria-label={`Save name for ${project.name}`}
                    className="rounded-md bg-sky-500/90 px-2.5 py-1 text-xs font-medium text-neutral-950 hover:bg-sky-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
                  >
                    Save name
                  </button>
                  <button
                    type="button"
                    aria-label={`Cancel renaming ${project.name}`}
                    onClick={() => setRenamingId(null)}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-100">
                      {project.name}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {project.elements.length}{" "}
                      {project.elements.length === 1 ? "element" : "elements"}
                    </p>
                  </div>
                  <Link
                    href={`/editor?id=${project.id}`}
                    aria-label={`Open ${project.name}`}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-sky-300 hover:bg-neutral-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
                  >
                    Open
                  </Link>
                  <button
                    type="button"
                    aria-label={`Rename ${project.name}`}
                    onClick={() => {
                      setRenamingId(project.id);
                      setRenameValue(project.name);
                    }}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    aria-label={`Duplicate ${project.name}`}
                    onClick={() => {
                      void duplicate(project);
                    }}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${project.name}`}
                    onClick={() => {
                      void remove(project);
                    }}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-950/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-400"
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
