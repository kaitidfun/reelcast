import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLatestTrackingSync, fetchTrackingSyncStatus, syncTrackingData, type TrackingSyncRun } from '@/lib/api';

export function useTrackingSync(onCompleted: () => void) {
  const [job, setJob] = useState<TrackingSyncRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const startController = useRef<AbortController | null>(null);
  const completed = useRef<string | null>(null);
  const generation = useRef(0);
  const receive = useCallback((result: TrackingSyncRun | null) => {
    setJob(result);
    if (result && !result.active && completed.current !== result.job_id) {
      completed.current = result.job_id;
      onCompleted();
    }
  }, [onCompleted]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const initialGeneration = generation.current;
    void fetchLatestTrackingSync(controller.signal).then(result => {
      if (!controller.signal.aborted && initialGeneration === generation.current) {
        if (result && !result.active) completed.current = result.job_id;
        receive(result);
      }
    }).catch(err => {
      if (!controller.signal.aborted && initialGeneration === generation.current) setError(err instanceof Error ? err.message : 'Unable to recover sync status');
    });
    return () => { mounted.current = false; controller.abort(); startController.current?.abort(); };
  }, [receive]);

  const jobId = job?.job_id;
  const active = Boolean(job?.active);
  useEffect(() => {
    if (!active || !jobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let failures = 0;
    let stopped = false;
    const poll = async () => {
      if (controller.signal.aborted || stopped || inFlight) return;
      if (document.hidden || !navigator.onLine) return;
      inFlight = true;
      try {
        const result = await fetchTrackingSyncStatus(jobId, controller.signal);
        if (controller.signal.aborted) return;
        failures = 0;
        stopped = !result.active;
        setError('');
        receive(result);
      } catch (err) {
        if (!controller.signal.aborted) {
          const status = (err as { status?: number })?.status;
          if (status === 404 || status === 401 || status === 403) {
            stopped = true;
            setJob(null);
            setError(status === 404 ? 'Sync status is no longer available. Start a new sync.' : 'Sign in again to check synchronization status.');
            return;
          }
          failures++;
          setError('Unable to refresh sync status. The job continues; status will retry automatically.');
        }
      } finally {
        inFlight = false;
        if (!controller.signal.aborted && !stopped) timer = setTimeout(poll, Math.min(30_000, 2_000 * 2 ** failures));
      }
    };
    const resume = () => {
      if (document.hidden || !navigator.onLine || inFlight || stopped) return;
      clearTimeout(timer);
      void poll();
    };
    timer = setTimeout(poll, 500);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      controller.abort(); clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    };
  }, [jobId, active, receive]);

  const start = async () => {
    if (startController.current || active) return;
    const controller = new AbortController();
    generation.current++;
    startController.current = controller;
    setStarting(true); setError('');
    try {
      const result = await syncTrackingData(controller.signal);
      if (mounted.current && !controller.signal.aborted) receive(result);
    } catch (err) {
      if (mounted.current && !controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to start sync');
    } finally {
      startController.current = null;
      if (mounted.current) setStarting(false);
    }
  };
  return { job, busy: starting || active, error, start };
}
