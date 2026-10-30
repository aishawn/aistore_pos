"""Standalone durable worker for deployments that separate web and jobs."""

import asyncio

from .db import init_db
from .main import process_next_job, settings


async def worker_loop() -> None:
    init_db()
    while True:
        await process_next_job()
        await asyncio.sleep(settings.worker_poll_seconds)


def main() -> None:
    asyncio.run(worker_loop())


if __name__ == "__main__":
    main()
