"""Shared pytest fixtures for the seeding component unit test suite.

NO-SERVER RULE: no fixture in this file - and no test in this suite - may spawn,
start, or connect to a PostgreSQL server. `pytest-postgresql` is pinned in
`requirements.txt` to honour the binding decision in
`docs/specs/SPEC-001-REVIEW.md`, but none of its fixtures may be imported or
requested: they require a `postgres` executable that exists neither in the
seeding image nor in CI, so any such test would fail at build time. The database
is always represented by the fake connection/cursor recorder defined below. Do
not add a server-spawning fixture here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from types import TracebackType
from typing import Any, Callable, Iterator, Sequence

import pytest

SEEDING_ROOT: Path = Path(__file__).resolve().parent.parent
SHIPPED_FIXTURES_ROOT: Path = SEEDING_ROOT / "fixtures"

EXECUTE: str = "execute"
EXECUTEMANY: str = "executemany"
FETCHONE: str = "fetchone"
FETCHALL: str = "fetchall"
COMMIT: str = "commit"
ROLLBACK: str = "rollback"
CLOSE: str = "close"
CURSOR: str = "cursor"
CURSOR_CLOSE: str = "cursor_close"
TRANSACTION_ENTER: str = "transaction_enter"
TRANSACTION_EXIT: str = "transaction_exit"


@dataclass(frozen=True)
class RecordedCall:
    """RecordedCall records a single interaction with the fake database objects.

    Attributes:
        name (str): The interaction name, one of the module-level call-name
            constants (`EXECUTE`, `COMMIT`, `TRANSACTION_ENTER`, ...).
        sql (str | None): The statement passed to `execute`/`executemany`, or
            `None` for interactions that carry no statement.
        params (Any): The parameters passed alongside the statement, or `None`.
    """

    name: str
    sql: str | None = None
    params: Any = None


@dataclass
class CallRecorder:
    """CallRecorder accumulates the ordered interactions of a fake connection.

    A single recorder is shared by a fake connection and every cursor it hands
    out, so `calls` is the interleaved, chronological call sequence across both.

    Attributes:
        calls (list[RecordedCall]): Every recorded interaction, in order.
    """

    calls: list[RecordedCall] = field(default_factory=list)

    def record(
        self,
        name: str,
        sql: str | None = None,
        params: Any = None,
    ) -> None:
        """record appends a single interaction to the call sequence.

        Args:
            name (str): The interaction name.
            sql (str | None): The statement, if the interaction carries one.
            params (Any): The statement parameters, if any.

        Returns:
            None
        """

        self.calls.append(RecordedCall(name=name, sql=sql, params=params))

    @property
    def names(self) -> list[str]:
        """names returns the ordered interaction names.

        Returns:
            list[str]: The name of every recorded interaction, in order.
        """

        return [call.name for call in self.calls]

    @property
    def executed(self) -> list[RecordedCall]:
        """executed returns the statement-carrying interactions.

        Returns:
            list[RecordedCall]: Every `execute`/`executemany` call, in order.
        """

        return [call for call in self.calls if call.name in (EXECUTE, EXECUTEMANY)]

    @property
    def statements(self) -> list[str]:
        """statements returns the executed SQL statements.

        Returns:
            list[str]: The SQL of every `execute`/`executemany` call, in order.
        """

        return [call.sql for call in self.executed if call.sql is not None]

    @property
    def parameters(self) -> list[Any]:
        """parameters returns the parameters of the executed statements.

        Returns:
            list[Any]: The parameters of every `execute`/`executemany` call, in
                order, aligned index-for-index with `statements`.
        """

        return [call.params for call in self.executed]

    @property
    def commit_count(self) -> int:
        """commit_count returns the number of commits performed.

        Returns:
            int: The count of `commit` interactions.
        """

        return self.names.count(COMMIT)

    @property
    def rollback_count(self) -> int:
        """rollback_count returns the number of rollbacks performed.

        Returns:
            int: The count of `rollback` interactions.
        """

        return self.names.count(ROLLBACK)


class FakeCursor:
    """FakeCursor is an offline stand-in for a `psycopg` cursor.

    The cursor executes nothing: it records every interaction on the shared
    recorder and returns rows from a pre-seeded queue.
    """

    def __init__(
        self,
        recorder: CallRecorder,
        rows: Sequence[Any] | None = None,
        row_factory: Any = None,
    ) -> None:
        """__init__ builds a fake cursor bound to a recorder.

        Args:
            recorder (CallRecorder): The recorder collecting the call sequence.
            rows (Sequence[Any] | None): Rows returned by `fetchone`/`fetchall`.
            row_factory (Any): The row factory the caller requested; recorded
                for assertions but otherwise unused.

        Returns:
            None
        """

        self.recorder = recorder
        self.row_factory = row_factory
        self.rows: list[Any] = list(rows or [])
        self.closed: bool = False

    def execute(self, sql: Any, params: Any = None) -> "FakeCursor":
        """execute records a statement and its parameters.

        Args:
            sql (Any): The statement to record; coerced to `str`.
            params (Any): The statement parameters.

        Returns:
            FakeCursor: This cursor, matching the `psycopg` return contract.
        """

        self.recorder.record(EXECUTE, sql=str(sql), params=params)
        return self

    def executemany(self, sql: Any, params_seq: Any = None) -> "FakeCursor":
        """executemany records a statement and its parameter sequence.

        Args:
            sql (Any): The statement to record; coerced to `str`.
            params_seq (Any): The sequence of parameter tuples.

        Returns:
            FakeCursor: This cursor, matching the `psycopg` return contract.
        """

        params = list(params_seq) if params_seq is not None else None
        self.recorder.record(EXECUTEMANY, sql=str(sql), params=params)
        return self

    def fetchone(self) -> Any:
        """fetchone records the call and pops the next queued row.

        Returns:
            Any: The next queued row, or `None` when the queue is empty.
        """

        self.recorder.record(FETCHONE)
        return self.rows.pop(0) if self.rows else None

    def fetchall(self) -> list[Any]:
        """fetchall records the call and drains the queued rows.

        Returns:
            list[Any]: Every remaining queued row.
        """

        self.recorder.record(FETCHALL)
        rows, self.rows = self.rows, []
        return rows

    def close(self) -> None:
        """close records the cursor close.

        Returns:
            None
        """

        self.recorder.record(CURSOR_CLOSE)
        self.closed = True

    def __enter__(self) -> "FakeCursor":
        """__enter__ enters the cursor context.

        Returns:
            FakeCursor: This cursor.
        """

        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        """__exit__ closes the cursor on context exit.

        Args:
            exc_type (type[BaseException] | None): The raised exception type.
            exc (BaseException | None): The raised exception.
            traceback (TracebackType | None): The exception traceback.

        Returns:
            None
        """

        self.close()


class FakeTransaction:
    """FakeTransaction records entry into and exit from a transaction block."""

    def __init__(self, recorder: CallRecorder) -> None:
        """__init__ builds a fake transaction bound to a recorder.

        Args:
            recorder (CallRecorder): The recorder collecting the call sequence.

        Returns:
            None
        """

        self.recorder = recorder

    def __enter__(self) -> "FakeTransaction":
        """__enter__ records the transaction entry.

        Returns:
            FakeTransaction: This transaction.
        """

        self.recorder.record(TRANSACTION_ENTER)
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        """__exit__ records the transaction exit.

        No implicit commit or rollback is performed: the recorder reports only
        what the code under test does explicitly.

        Args:
            exc_type (type[BaseException] | None): The raised exception type.
            exc (BaseException | None): The raised exception.
            traceback (TracebackType | None): The exception traceback.

        Returns:
            None
        """

        self.recorder.record(TRANSACTION_EXIT)


class FakeConnection:
    """FakeConnection is an offline stand-in for a `psycopg` connection.

    No socket is opened and no server is contacted. Every cursor handed out
    shares this connection's recorder, so `recorder.calls` is the full,
    chronological call sequence for the unit of work under test.
    """

    def __init__(
        self,
        recorder: CallRecorder | None = None,
        rows: Sequence[Any] | None = None,
    ) -> None:
        """__init__ builds a fake connection.

        Args:
            recorder (CallRecorder | None): An existing recorder to share; a new
                one is created when omitted.
            rows (Sequence[Any] | None): Rows handed to every cursor created by
                this connection.

        Returns:
            None
        """

        self.recorder = recorder if recorder is not None else CallRecorder()
        self.rows: list[Any] = list(rows or [])
        self.cursors: list[FakeCursor] = []
        self.closed: bool = False

    def cursor(self, *args: Any, row_factory: Any = None, **kwargs: Any) -> FakeCursor:
        """cursor records the request and returns a new fake cursor.

        Args:
            *args (Any): Positional arguments accepted for signature parity.
            row_factory (Any): The requested row factory, recorded on the cursor.
            **kwargs (Any): Keyword arguments accepted for signature parity.

        Returns:
            FakeCursor: A cursor sharing this connection's recorder.
        """

        self.recorder.record(CURSOR)
        cursor = FakeCursor(
            recorder=self.recorder, rows=self.rows, row_factory=row_factory
        )
        self.cursors.append(cursor)
        return cursor

    def execute(self, sql: Any, params: Any = None) -> FakeCursor:
        """execute records a statement issued directly on the connection.

        Args:
            sql (Any): The statement to record; coerced to `str`.
            params (Any): The statement parameters.

        Returns:
            FakeCursor: A cursor carrying the recorded statement.
        """

        return self.cursor().execute(sql, params)

    def transaction(self, *args: Any, **kwargs: Any) -> FakeTransaction:
        """transaction returns a recording transaction context manager.

        Args:
            *args (Any): Positional arguments accepted for signature parity.
            **kwargs (Any): Keyword arguments accepted for signature parity.

        Returns:
            FakeTransaction: A context manager recording enter and exit.
        """

        return FakeTransaction(self.recorder)

    def commit(self) -> None:
        """commit records a commit.

        Returns:
            None
        """

        self.recorder.record(COMMIT)

    def rollback(self) -> None:
        """rollback records a rollback.

        Returns:
            None
        """

        self.recorder.record(ROLLBACK)

    def close(self) -> None:
        """close records the connection close.

        Returns:
            None
        """

        self.recorder.record(CLOSE)
        self.closed = True

    def __enter__(self) -> "FakeConnection":
        """__enter__ records entry into the connection's transaction block.

        Returns:
            FakeConnection: This connection.
        """

        self.recorder.record(TRANSACTION_ENTER)
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        """__exit__ records exit from the connection's transaction block.

        No implicit commit or rollback is performed: the recorder reports only
        what the code under test does explicitly.

        Args:
            exc_type (type[BaseException] | None): The raised exception type.
            exc (BaseException | None): The raised exception.
            traceback (TracebackType | None): The exception traceback.

        Returns:
            None
        """

        self.recorder.record(TRANSACTION_EXIT)


@pytest.fixture
def call_recorder() -> CallRecorder:
    """call_recorder provides an empty recorder for the call sequence.

    Returns:
        CallRecorder: A fresh recorder.
    """

    return CallRecorder()


@pytest.fixture
def fake_connection_factory(
    call_recorder: CallRecorder,
) -> Callable[..., FakeConnection]:
    """fake_connection_factory builds fake connections sharing one recorder.

    Args:
        call_recorder (CallRecorder): The recorder shared by every connection
            the factory produces.

    Returns:
        Callable[..., FakeConnection]: A callable accepting an optional `rows`
            sequence and returning a fake connection.
    """

    def _build(rows: Sequence[Any] | None = None) -> FakeConnection:
        """_build creates a fake connection bound to the shared recorder.

        Args:
            rows (Sequence[Any] | None): Rows handed to the cursors it creates.

        Returns:
            FakeConnection: The fake connection.
        """

        return FakeConnection(recorder=call_recorder, rows=rows)

    return _build


@pytest.fixture
def fake_connection(
    fake_connection_factory: Callable[..., FakeConnection],
) -> FakeConnection:
    """fake_connection provides a ready fake connection with no queued rows.

    Args:
        fake_connection_factory (Callable[..., FakeConnection]): The factory
            building connections bound to the shared recorder.

    Returns:
        FakeConnection: A fake connection whose `recorder` holds the call
            sequence.
    """

    return fake_connection_factory()


@pytest.fixture
def fixtures_root(tmp_path: Path) -> Iterator[Path]:
    """fixtures_root provides an empty temporary directory for fixture trees.

    Args:
        tmp_path (Path): The per-test temporary directory supplied by pytest.

    Yields:
        Path: A directory into which tests write synthetic fixture files.
    """

    root = tmp_path / "fixtures"
    root.mkdir()
    yield root


@pytest.fixture
def shipped_fixtures_root() -> Path:
    """shipped_fixtures_root points at the real `scripts/seeding/fixtures/` tree.

    Returns:
        Path: The directory holding the fixtures shipped with the seeding
            component.
    """

    return SHIPPED_FIXTURES_ROOT
