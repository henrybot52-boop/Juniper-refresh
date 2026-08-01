"""A small HTTP helper: one requests.Session with retry + exponential backoff.

Both the live watcher and the batch downloaders share this. The watcher in
particular must *never crash* on a transient API failure, so :func:`get_text`
and :func:`get_json` retry a bounded number of times and then raise a single
:class:`FetchError` the caller can catch and log.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import requests

log = logging.getLogger("ktf.http")


class FetchError(RuntimeError):
    """Raised after all retries are exhausted."""


class HttpClient:
    def __init__(
        self,
        user_agent: str,
        max_retries: int = 4,
        backoff_base_seconds: float = 2.0,
        timeout_seconds: int = 30,
        sleep=time.sleep,
    ) -> None:
        self.max_retries = max_retries
        self.backoff_base_seconds = backoff_base_seconds
        self.timeout_seconds = timeout_seconds
        self._sleep = sleep
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": user_agent, "Accept": "*/*"})

    def _get(self, url: str, params: dict[str, Any] | None = None) -> requests.Response:
        last_exc: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                resp = self.session.get(url, params=params, timeout=self.timeout_seconds)
                # Retry 5xx and 429; treat other 4xx as terminal (no point retrying).
                if resp.status_code >= 500 or resp.status_code == 429:
                    raise requests.HTTPError(
                        f"{resp.status_code} from {resp.url}", response=resp
                    )
                resp.raise_for_status()
                return resp
            except (requests.RequestException, requests.HTTPError) as exc:
                last_exc = exc
                # Terminal 4xx (except 429) -> stop immediately.
                status = getattr(getattr(exc, "response", None), "status_code", None)
                if status is not None and 400 <= status < 500 and status != 429:
                    break
                if attempt < self.max_retries:
                    wait = self.backoff_base_seconds * (2 ** (attempt - 1))
                    log.warning(
                        "GET %s failed (attempt %d/%d): %s — retrying in %.0fs",
                        url, attempt, self.max_retries, exc, wait,
                    )
                    self._sleep(wait)
        raise FetchError(f"GET {url} failed after {self.max_retries} attempts: {last_exc}")

    def get_json(self, url: str, params: dict[str, Any] | None = None) -> Any:
        return self._get(url, params).json()

    def get_text(self, url: str, params: dict[str, Any] | None = None) -> str:
        return self._get(url, params).text
