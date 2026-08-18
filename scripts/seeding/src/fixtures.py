"""Discovery, loading and validation of the JSON domain fixtures.

This module is the whole of the seeder's on-disk phase: it finds the domain
files under a fixtures root, parses them, and validates every aggregate through
the model that owns it (`models.DOMAIN_FIXTURE_MODELS`). It performs **no**
database interaction whatsoever - it imports neither `psycopg` nor `config`, so
a fixture violating its model raises before a connection can exist (AC-7). The
persistence layer receives the already-validated `DomainFixtures` result.

Discovery is deliberately strict in both directions (REQ-2.3): a catalogue file
that is absent, and a `.json` file at the root that maps to no model, are both
errors. Silently skipping either would mean seeding a partial database and
calling it a success.

Only `.json` files **at the fixtures root** are domain files. Sidecar document
content lives under `fixtures/documents/**` and is never scanned: it is reached
exclusively through a document fixture's `content` path, which the document
model resolves against the same root (binding decision F-1).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.models import DOMAIN_FIXTURE_MODELS, IdentifiedFixtureModel

# Suffix carried by every domain fixture file.
JSON_SUFFIX: str = ".json"

# Name of the sidecar content directory under the fixtures root. It holds
# document content, never domain files, and is therefore not scanned.
DOCUMENTS_DIRECTORY_NAME: str = "documents"

# The fixtures shipped with this component: scripts/seeding/fixtures/.
DEFAULT_FIXTURES_ROOT: Path = Path(__file__).resolve().parent.parent / "fixtures"


class FixtureError(Exception):
    """FixtureError is the base of every error raised by this module.

    It lets a caller - the CLI in particular - distinguish a fixture-tree
    problem from any other failure, without enumerating the specific causes.
    """


class FixturesRootNotFoundError(FixtureError):
    """FixturesRootNotFoundError signals a fixtures root that is not a
    directory."""


class MissingFixtureFileError(FixtureError):
    """MissingFixtureFileError signals a catalogue file absent from the root."""


class UnknownFixtureFileError(FixtureError):
    """UnknownFixtureFileError signals a root `.json` file that maps to no
    model."""


class MalformedFixtureFileError(FixtureError):
    """MalformedFixtureFileError signals a file that is not a JSON array of
    objects."""


@dataclass(frozen=True)
class DomainFixtures:
    """DomainFixtures is the validated result of loading a fixture tree.

    Attributes:
        fixtures_root (Path): The fully resolved root the fixtures were loaded
            from, and against which document sidecar paths were resolved.
        domains (dict[str, list[IdentifiedFixtureModel]]): The validated
            aggregates of every catalogue file, keyed by file name and held in
            the order they appear in the file.
    """

    fixtures_root: Path
    domains: dict[str, list[IdentifiedFixtureModel]]

    def aggregates(self, file_name: str) -> list[IdentifiedFixtureModel]:
        """aggregates returns the validated aggregates of one domain file.

        Args:
            file_name (str): Name of the domain file, as listed in the
                catalogue.

        Returns:
            list[IdentifiedFixtureModel]: The aggregates loaded from that file.

        Raises:
            KeyError: If the name is not a catalogue file name.
        """

        return self.domains[file_name]


def discover_domain_files(fixtures_root: Path) -> dict[str, Path]:
    """discover_domain_files maps every catalogue file name to its path.

    Only `.json` files directly at the root are considered: the `documents/`
    sidecar tree is a subdirectory and is therefore never reached.

    Args:
        fixtures_root (Path): Root directory holding the domain fixture files.

    Returns:
        dict[str, Path]: The path of every catalogue file, keyed by file name.

    Raises:
        FixturesRootNotFoundError: If the root is not an existing directory.
        MissingFixtureFileError: If a catalogue file is absent.
        UnknownFixtureFileError: If a root `.json` file maps to no model.
    """

    if not fixtures_root.is_dir():
        raise FixturesRootNotFoundError(
            f"fixtures root '{fixtures_root}' is not an existing directory"
        )

    present = {
        entry.name
        for entry in fixtures_root.iterdir()
        if entry.is_file() and entry.suffix == JSON_SUFFIX
    }

    missing = sorted(set(DOMAIN_FIXTURE_MODELS) - present)
    if missing:
        raise MissingFixtureFileError(
            f"fixture files {missing} are missing from '{fixtures_root}'"
        )

    unknown = sorted(present - set(DOMAIN_FIXTURE_MODELS))
    if unknown:
        raise UnknownFixtureFileError(
            f"fixture files {unknown} in '{fixtures_root}' map to no domain "
            "model; add the model to models.DOMAIN_FIXTURE_MODELS or remove "
            "the file"
        )

    return {file_name: fixtures_root / file_name for file_name in DOMAIN_FIXTURE_MODELS}


def read_domain_file(path: Path) -> list[Any]:
    """read_domain_file parses one domain file into its array of aggregates.

    Args:
        path (Path): Path of the domain fixture file.

    Returns:
        list[Any]: The raw, unvalidated aggregate payloads of the file.

    Raises:
        MalformedFixtureFileError: If the file is not valid JSON, or holds
            anything other than an array (REQ-2.3).
    """

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise MalformedFixtureFileError(
            f"fixture file '{path}' is not valid JSON: {error}"
        ) from error

    if not isinstance(payload, list):
        raise MalformedFixtureFileError(
            f"fixture file '{path}' must hold a JSON array of objects, got "
            f"{type(payload).__name__}"
        )

    return payload


def load_domain_file(
    path: Path,
    model: type[IdentifiedFixtureModel],
    fixtures_root: Path,
) -> list[IdentifiedFixtureModel]:
    """load_domain_file validates one domain file through its aggregate model.

    The fixtures root is passed to each aggregate so that document sidecar paths
    resolve against it and `size` is derived from the file's byte length,
    however deeply the document is nested.

    Args:
        path (Path): Path of the domain fixture file.
        model (type[IdentifiedFixtureModel]): Model validating one element of
            the file's array.
        fixtures_root (Path): Fully resolved root that sidecar paths resolve
            against.

    Returns:
        list[IdentifiedFixtureModel]: The validated aggregates, in file order.

    Raises:
        MalformedFixtureFileError: If the file is not a JSON array.
        pydantic.ValidationError: If an aggregate violates its model.
    """

    return [
        model.from_fixture(data=data, fixtures_root=fixtures_root)
        for data in read_domain_file(path=path)
    ]


def load_fixtures(fixtures_root: Path = DEFAULT_FIXTURES_ROOT) -> DomainFixtures:
    """load_fixtures discovers, parses and validates a whole fixture tree.

    Every file of the catalogue is validated before the result is returned, so
    an invalid fixture anywhere in the tree fails the run while it is still a
    purely on-disk operation.

    Args:
        fixtures_root (Path): Root directory holding the domain fixture files.
            Defaults to the fixtures shipped with this component.

    Returns:
        DomainFixtures: The validated aggregates of every catalogue file.

    Raises:
        FixtureError: If the tree is missing, incomplete, carries an
            unrecognised file, or holds a malformed file.
        pydantic.ValidationError: If an aggregate violates its model.
    """

    discovered = discover_domain_files(fixtures_root=fixtures_root)
    resolved_root = fixtures_root.resolve()

    domains = {
        file_name: load_domain_file(
            path=path,
            model=DOMAIN_FIXTURE_MODELS[file_name],
            fixtures_root=resolved_root,
        )
        for file_name, path in discovered.items()
    }

    return DomainFixtures(fixtures_root=resolved_root, domains=domains)
