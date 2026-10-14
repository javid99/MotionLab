import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// With vitest `globals: false`, RTL's automatic cleanup is not registered;
// unmount rendered components after each test explicitly.
afterEach(() => {
  cleanup();
});
