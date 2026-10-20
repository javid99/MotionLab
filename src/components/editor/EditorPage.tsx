"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  createProjectRepository,
  type ProjectRepository,
} from "@/persistence/projectRepository";
import { createProject } from "@/project/defaults";
import { useProjectStore } from "@/editor/projectStore";
import EditorShell from "./EditorShell";

/**
 * Editor route content (T14): opens the project named by the `?id=` query
 * parameter, loading it from the repository (runtime-validated read path)
 * into the persistent project store. This is explicit "Open" navigation —
 * not automatic hydration. A missing or invalid project falls back to a
 * fresh untitled project so the editor stays usable ("deleting current
 * project handled gracefully").
 *
 * Readiness is derived (loaded id matches the requested id) rather than
 * toggled imperatively, so changing the id re-enters the loading state
 * without synchronous state updates in the effect body.
 */

const defaultRepository = createProjectRepository();

export default function EditorPage({
  repository: repositoryProp,
}: {
  /** Test injection point; defaults to the real IndexedDB repository. */
  repository?: ProjectRepository;
}) {
  const repository = repositoryProp ?? defaultRepository;
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id");
  const setProject = useProjectStore((s) => s.setProject);
  // undefined = nothing loaded yet; otherwise the id whose load completed.
  const [loadedId, setLoadedId] = useState<string | null | undefined>(
    projectId === null ? null : undefined,
  );
  const isReady = projectId === null || loadedId === projectId;

  useEffect(() => {
    if (projectId === null) {
      return;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const project = await repository.get(projectId);
        if (!cancelled) {
          setProject(project ?? createProject());
          setLoadedId(projectId);
        }
      } catch {
        // Unavailable project (e.g. deleted elsewhere or unreadable):
        // fall back to a fresh untitled project instead of failing hard.
        if (!cancelled) {
          setProject(createProject());
          setLoadedId(projectId);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, repository, setProject]);

  if (!isReady) {
    return (
      <main
        aria-label="Editor workspace"
        className="flex h-dvh items-center justify-center"
        data-testid="editor-loading"
      >
        <p className="text-sm text-neutral-400">Loading project&hellip;</p>
      </main>
    );
  }
  return <EditorShell />;
}
