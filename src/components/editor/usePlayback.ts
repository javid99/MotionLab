"use client";

import { useEffect, useRef } from "react";
import { PlaybackController, type FrameScheduler } from "@/editor/playback";
import {
  createEditorPlaybackHost,
  createRafScheduler,
} from "@/editor/playbackHost";

/**
 * React lifecycle wiring for the T10 `PlaybackController` (T11). Creates the
 * controller after mount (one instance per consuming component — no
 * duplicate controllers or concurrent loops) and disposes it on unmount,
 * cancelling any pending scheduled frame. The controller object itself and
 * all timing logic live in `src/editor/playback.ts`; this hook only owns
 * creation/cleanup. An optional `scheduler` (test injection) must be
 * provided consistently across renders; it is captured on first render.
 */
export function usePlayback(
  scheduler?: FrameScheduler,
): React.RefObject<PlaybackController | null> {
  const controllerRef = useRef<PlaybackController | null>(null);
  const schedulerRef = useRef<FrameScheduler | null>(null);
  if (schedulerRef.current === null) {
    schedulerRef.current = scheduler ?? createRafScheduler();
  }

  useEffect(() => {
    controllerRef.current = new PlaybackController(
      createEditorPlaybackHost(),
      schedulerRef.current as FrameScheduler,
    );
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  return controllerRef;
}
