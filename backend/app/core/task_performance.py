"""Celery queue wait and execution timings. No task arguments are logged."""
import logging
from functools import wraps
from time import perf_counter, time

from celery.signals import before_task_publish, task_prerun, task_postrun

logger = logging.getLogger("reelcast.performance")


def timed_step(function):
    @wraps(function)
    async def measured(*args, **kwargs):
        from celery import current_task
        started = perf_counter()
        outcome = 'failed'
        try:
            result = await function(*args, **kwargs)
            outcome = 'completed'
            return result
        finally:
            request = getattr(current_task, 'request', None)
            logger.info('pipeline_step id=%s step=%s outcome=%s run_ms=%.2f',
                        getattr(request, 'id', None), function.__name__, outcome,
                        (perf_counter() - started) * 1000)
    return measured


@before_task_publish.connect
def stamp_enqueue_time(headers=None, **_kwargs):
    if headers is not None:
        headers["reelcast_enqueued_at"] = time()


@task_prerun.connect
def start_task_timing(task=None, task_id=None, **_kwargs):
    task.request.reelcast_started = perf_counter()
    enqueued = (task.request.headers or {}).get("reelcast_enqueued_at")
    wait_ms = max(0, (time() - enqueued) * 1000) if isinstance(enqueued, (float, int)) else None
    logger.info("task_started id=%s task=%s queue_wait_ms=%s", task_id, task.name, wait_ms)


@task_postrun.connect
def finish_task_timing(task=None, task_id=None, state=None, **_kwargs):
    started = getattr(task.request, "reelcast_started", None)
    if started is not None:
        logger.info("task_finished id=%s task=%s state=%s run_ms=%.2f",
                    task_id, task.name, state, (perf_counter() - started) * 1000)
