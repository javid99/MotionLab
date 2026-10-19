"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { FrameScheduler } from "@/editor/playback";
import { usePlayback } from "./usePlayback";
import { useEditorStore } from "@/editor/editorStore";
import { useProjectStore } from "@/editor/projectStore";
import { evaluate } from "@/engine/evaluator";
import {
  fractionToTime,
  keyframesForProperty,
  timeToFraction,
} from "@/engine/timeline";
import { createKeyframe } from "@/project/defaults";
import {
  ANIMATABLE_PROPERTIES,
  type AnimatableProperty,
} from "@/project/model";

/**
 * Timeline panel (T11): time ruler, per-element/property tracks with
 * draggable keyframes, playhead overlay, and transport controls.
 *
 * Interactions (all committed once through the stores — never per frame):
 * - Ruler pointer down/drag → scrub via the `PlaybackController` (pauses
 *   playback per the documented Scrub semantics).
 * - Empty lane click → adds a keyframe at that time with the current
 *   evaluated value (via the T9 evaluator).
 * - Keyframe diamond drag → moves the keyframe on release via
 *   `moveKeyframe` (duplicate/invalid targets are rejected by the store).
 *
 * Time↔position mapping goes through the pure engine helpers
 * `timeToFraction`/`fractionToTime`; pixel fractions are clamped to [0, 1]
 * and re-measured from the lane rect on every event (resize-safe).
 */

interface KeyframeDrag {
  keyframeId: string;
  elementId: string;
  lane: HTMLElement;
  fraction: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export default function TimelineStrip({
  scheduler,
}: {
  /** Test injection point; defaults to the rAF scheduler. */
  scheduler?: FrameScheduler;
}) {
  const project = useProjectStore((s) => s.project);
  const addKeyframe = useProjectStore((s) => s.addKeyframe);
  const moveKeyframe = useProjectStore((s) => s.moveKeyframe);
  const playheadMs = useEditorStore((s) => s.playheadMs);
  const playback = usePlayback(scheduler);
  const scrubLaneRef = useRef<HTMLElement | null>(null);
  const [drag, setDrag] = useState<KeyframeDrag | null>(null);

  const duration = project.durationMs;
  const playheadFraction = timeToFraction(playheadMs, duration);

  function laneTimeFromEvent(
    event: ReactPointerEvent,
    lane: HTMLElement,
  ): number {
    const rect = lane.getBoundingClientRect();
    const fraction =
      rect.width > 0 ? clamp01((event.clientX - rect.left) / rect.width) : 0;
    return fractionToTime(fraction, duration);
  }

  function capturePointer(event: ReactPointerEvent): void {
    try {
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    } catch {
      // jsdom does not implement pointer capture; tests dispatch events
      // directly on the container, so interactions still work there.
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    const target = event.target as Element;

    const keyframeEl = target.closest<HTMLElement>("[data-keyframe-id]");
    if (keyframeEl) {
      const lane = keyframeEl.closest<HTMLElement>("[data-lane]");
      if (lane) {
        const rect = lane.getBoundingClientRect();
        setDrag({
          keyframeId: keyframeEl.dataset.keyframeId as string,
          elementId: keyframeEl.dataset.elementId as string,
          lane,
          fraction:
            rect.width > 0 ? clamp01((event.clientX - rect.left) / rect.width) : 0,
        });
        capturePointer(event);
        return;
      }
    }

    const laneEl = target.closest<HTMLElement>("[data-lane]");
    if (laneEl) {
      const elementId = laneEl.dataset.elementId as string;
      const property = laneEl.dataset.property as AnimatableProperty;
      const timeMs = Math.round(laneTimeFromEvent(event, laneEl));
      const evaluated = evaluate(project, timeMs).elements.find(
        (el) => el.id === elementId,
      );
      const value =
        evaluated === undefined
          ? 0
          : property === "opacity"
            ? evaluated.opacity
            : evaluated.transform[property];
      addKeyframe(elementId, createKeyframe(property, timeMs, value));
      return;
    }

    const ruler = target.closest<HTMLElement>("[data-ruler]");
    if (ruler) {
      scrubLaneRef.current = ruler;
      playback.current?.scrub(laneTimeFromEvent(event, ruler));
      capturePointer(event);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (drag) {
      const rect = drag.lane.getBoundingClientRect();
      const fraction =
        rect.width > 0
          ? clamp01((event.clientX - rect.left) / rect.width)
          : drag.fraction;
      setDrag({ ...drag, fraction });
      return;
    }
    if (scrubLaneRef.current) {
      playback.current?.scrub(laneTimeFromEvent(event, scrubLaneRef.current));
    }
  }

  function handlePointerUp(): void {
    if (drag) {
      moveKeyframe(
        drag.elementId,
        drag.keyframeId,
        Math.round(fractionToTime(drag.fraction, duration)),
      );
      setDrag(null);
      return;
    }
    scrubLaneRef.current = null;
  }

  return (
    <section aria-label="Timeline" className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-neutral-800 px-4 py-1.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Timeline
        </h2>
        <div
          role="group"
          aria-label="Playback controls"
          className="flex items-center gap-1"
        >
          <button
            type="button"
            aria-label="Play"
            onClick={() => playback.current?.play()}
            className="rounded-md px-2 py-0.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
          >
            Play
          </button>
          <button
            type="button"
            aria-label="Pause"
            onClick={() => playback.current?.pause()}
            className="rounded-md px-2 py-0.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
          >
            Pause
          </button>
          <button
            type="button"
            aria-label="Stop"
            onClick={() => playback.current?.stop()}
            className="rounded-md px-2 py-0.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
          >
            Stop
          </button>
        </div>
        <span
          data-testid="playhead-readout"
          className="ml-auto text-xs text-neutral-400"
        >
          {Math.round(playheadMs)} / {duration} ms
        </span>
      </div>

      {project.elements.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-xs text-neutral-500">No keyframes yet.</p>
        </div>
      ) : (
        <div
          data-testid="timeline-body"
          className="relative min-h-0 flex-1 overflow-y-auto"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="relative pb-2">
            <div className="flex border-b border-neutral-800">
              <div className="w-20 shrink-0" />
              <div
                data-testid="time-ruler"
                data-ruler="true"
                aria-label="Time ruler"
                className="relative h-6 flex-1 cursor-ew-resize border-l border-neutral-800"
              >
                {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                  <span
                    key={f}
                    className="absolute top-1 -translate-x-1/2 text-[9px] text-neutral-500"
                    style={{ left: `${f * 100}%` }}
                  >
                    {Math.round(fractionToTime(f, duration))}
                  </span>
                ))}
              </div>
            </div>

            {project.elements.map((element) => (
              <div
                key={element.id}
                className="border-b border-neutral-800/60 pb-1"
              >
                <div className="px-2 py-0.5 text-[10px] font-medium text-neutral-400">
                  {element.name}
                </div>
                {ANIMATABLE_PROPERTIES.map((property) => (
                  <div key={property} className="flex items-stretch">
                    <div className="w-20 shrink-0 px-2 text-[9px] leading-[14px] text-neutral-500">
                      {property}
                    </div>
                    <div
                      data-lane="true"
                      data-element-id={element.id}
                      data-property={property}
                      className="relative flex-1 border-l border-neutral-800"
                      style={{ height: 14 }}
                    >
                      {keyframesForProperty(element, property).map(
                        (keyframe) => {
                          const fraction =
                            drag?.keyframeId === keyframe.id
                              ? drag.fraction
                              : timeToFraction(keyframe.timeMs, duration);
                          return (
                            <div
                              key={keyframe.id}
                              data-keyframe-id={keyframe.id}
                              data-element-id={element.id}
                              data-testid={`keyframe-${keyframe.id}`}
                              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-sky-400"
                              style={{ left: `${fraction * 100}%` }}
                            />
                          );
                        },
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            <div
              aria-hidden="true"
              data-testid="playhead-overlay"
              className="pointer-events-none absolute bottom-0 left-20 right-0 top-0"
            >
              <div
                data-testid="playhead-line"
                className="absolute bottom-0 top-0 w-px bg-sky-400"
                style={{ left: `${playheadFraction * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
