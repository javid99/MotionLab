import { Suspense } from "react";
import EditorPage from "@/components/editor/EditorPage";

export default function EditorPageRoute() {
  return (
    <Suspense
      fallback={
        <main className="flex h-dvh items-center justify-center">
          <p className="text-sm text-neutral-400">Loading project&hellip;</p>
        </main>
      }
    >
      <EditorPage />
    </Suspense>
  );
}
