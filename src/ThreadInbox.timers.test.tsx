// @vitest-environment jsdom
import { afterAll, afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

class TestMediaQueryList extends EventTarget implements MediaQueryList {
  readonly matches = false;
  onchange = null;
  constructor(readonly media: string) {
    super();
  }
  addListener(): void {}
  removeListener(): void {}
}

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds: ReadonlyArray<number> = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

vi.stubGlobal(
  "matchMedia",
  (query: string): MediaQueryList => new TestMediaQueryList(query),
);
vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) =>
  window.setTimeout(
    () => callback({ didTimeout: false, timeRemaining: () => 50 }),
    0,
  ),
);

const app = await loadPluginApp(() => import("../app"));
const inbox = app.threadLists[0]!;

const listProps = {
  activeThreadId: null,
  activeProjectId: null,
  isCompactViewport: false,
  onNavigate: () => {},
  searchQuery: "",
  Original: () => null,
};

function thread(
  overrides: Partial<PluginSidebarThread> = {},
): PluginSidebarThread {
  return {
    id: "thr_1",
    projectId: "proj_1",
    title: "A thread",
    titleFallback: null,
    parentThreadId: null,
    experimental_groupKey: null,
    experimental_groupLabel: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: 100,
    updatedAt: 100,
    lastReadAt: 100,
    latestAttentionAt: 100,
    ...overrides,
  };
}

const threads = [
  ...Array.from({ length: 4 }, (_, index) =>
    thread({ id: `pinned_${index}`, title: `Pinned ${index}`, isPinned: true }),
  ),
  ...Array.from({ length: 12 }, (_, index) =>
    thread({ id: `active_${index}`, title: `Active ${index}` }),
  ),
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

it(
  "registers no per-row poll intervals and releases every timer on unmount",
  { timeout: 20_000 },
  async () => {
    vi.useFakeTimers();
    const baseline = vi.getTimerCount();
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const pollIntervalCalls = () =>
      setIntervalSpy.mock.calls.filter(([, delay]) => delay === 2_000);

    const view = renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads,
        projects: [{ id: "proj_1", name: "bb", isPersonal: false }],
      },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    });
    expect(screen.getByText("Active 11")).toBeDefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(pollIntervalCalls()).toHaveLength(0);

    const callsBeforeRemount = pollIntervalCalls().length;
    const activeShelf = screen.getByRole("region", { name: "Active" });
    fireEvent.click(
      within(activeShelf).getByRole("button", { expanded: true }),
    );
    expect(within(activeShelf).queryByText("Active 11")).toBeNull();
    fireEvent.click(
      within(activeShelf).getByRole("button", { expanded: false }),
    );
    expect(within(activeShelf).getByText("Active 11")).toBeDefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(pollIntervalCalls().slice(callsBeforeRemount)).toHaveLength(0);

    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.getTimerCount()).toBe(baseline);
  },
);
