import { vi } from "vitest";

// Fixed wall clock; timers and elapsed-time scheduling keep their real behavior.
vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-15T00:00:00Z") });
