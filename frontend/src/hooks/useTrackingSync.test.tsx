import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTrackingSync } from './useTrackingSync';
import * as api from '@/lib/api';

vi.mock('@/lib/api', () => ({ fetchLatestTrackingSync: vi.fn(), fetchTrackingSyncStatus: vi.fn(), syncTrackingData: vi.fn() }));
const active: api.TrackingSyncRun = { job_id: 'run', status: 'running', active: true, social_metrics: 0, accounts: [] };
const done: api.TrackingSyncRun = { ...active, active: false, status: 'done', social_metrics: 8 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.mocked(api.fetchLatestTrackingSync).mockResolvedValue(null);
  vi.mocked(api.syncTrackingData).mockResolvedValue(active);
  vi.mocked(api.fetchTrackingSyncStatus).mockResolvedValue(done);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => vi.useRealTimers());

// F5-UTC01-TC02; STC-F5-01-TC-01, STC-F5-01-TC-03 (isolated UI behavior).
it('accepts once, polls to completion and refreshes once', async () => {
  const completed = vi.fn();
  const { result } = renderHook(() => useTrackingSync(completed));
  await act(async () => {});
  await act(async () => { void result.current.start(); void result.current.start(); });
  expect(api.syncTrackingData).toHaveBeenCalledTimes(1);
  expect(result.current.busy).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(result.current.busy).toBe(false);
  expect(completed).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(api.fetchTrackingSyncStatus).toHaveBeenCalledTimes(1);
});

// STC-F5-01-TC-02 (isolated restore/polling behavior).
it('recovers an existing job without enqueuing another and aborts on cleanup', async () => {
  vi.mocked(api.fetchLatestTrackingSync).mockResolvedValue(active);
  vi.mocked(api.fetchTrackingSyncStatus).mockImplementation(() => new Promise(() => {}));
  const completed = vi.fn();
  const { result, unmount } = renderHook(() => useTrackingSync(completed));
  await act(async () => {});
  expect(result.current.busy).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  const signal = vi.mocked(api.fetchTrackingSyncStatus).mock.calls[0][1];
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  expect(api.fetchTrackingSyncStatus).toHaveBeenCalledTimes(1);
  unmount();
  expect(signal?.aborted).toBe(true);
  expect(api.syncTrackingData).not.toHaveBeenCalled();
});

it('pauses hidden tabs and retries status errors without losing the job', async () => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  vi.mocked(api.fetchLatestTrackingSync).mockResolvedValue(active);
  vi.mocked(api.fetchTrackingSyncStatus).mockRejectedValueOnce(new Error('network')).mockResolvedValue(done);
  const completed = vi.fn();
  const { result } = renderHook(() => useTrackingSync(completed));
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(api.fetchTrackingSyncStatus).not.toHaveBeenCalled();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(result.current.error).toContain('job continues');
  expect(result.current.busy).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
  expect(completed).toHaveBeenCalledTimes(1);
  expect(result.current.error).toBe('');
});

it('does not let a slow initial restore erase a newly started job', async () => {
  let restore!: (value: api.TrackingSyncRun | null) => void;
  vi.mocked(api.fetchLatestTrackingSync).mockImplementation(() => new Promise(resolve => { restore = resolve; }));
  const completed = vi.fn();
  const { result } = renderHook(() => useTrackingSync(completed));
  await act(async () => { await result.current.start(); });
  await act(async () => { restore(null); });
  expect(result.current.job?.job_id).toBe('run');
  expect(result.current.busy).toBe(true);
});

it('settles an unavailable run instead of claiming a missing job continues forever', async () => {
  vi.mocked(api.fetchLatestTrackingSync).mockResolvedValue(active);
  vi.mocked(api.fetchTrackingSyncStatus).mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));
  const completed = vi.fn();
  const { result } = renderHook(() => useTrackingSync(completed));
  await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(result.current.busy).toBe(false);
  expect(result.current.error).toContain('Start a new sync');
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(api.fetchTrackingSyncStatus).toHaveBeenCalledTimes(1);
});
