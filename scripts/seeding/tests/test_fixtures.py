"""Unit tests for the fixture discovery, loading and validation layer.

Most tests build a **synthetic** fixture tree under `tmp_path` (the
`fixtures_root` fixture of `conftest.py`). The second section is the
**shipped-fixture harness**, which drives the real `scripts/seeding/fixtures/`
tree through the real loader and the real models, and the final section is the
**whole-corpus** capstone: the complete catalogue loaded through `load_fixtures`
and planned by the real persistence layer, proving that every shipped file
validates, every document sidecar resolves and every cross-file reference does
too. No test here touches a database - `src.fixtures` cannot open one, which is
the AC-7 ordering guarantee asserted by `test_module_imports_no_database_driver`.
"""

from __future__ import annotations

import ast
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

import pytest
from pydantic import ValidationError

from src.fixtures import (
    DOCUMENTS_DIRECTORY_NAME,
    JSON_SUFFIX,
    DomainFixtures,
    FixtureError,
    FixturesRootNotFoundError,
    MalformedFixtureFileError,
    MissingFixtureFileError,
    UnknownFixtureFileError,
    discover_domain_files,
    load_fixtures,
)
from src.models import (
    API_KEY_PATTERN,
    DOMAIN_FIXTURE_MODELS,
    DocumentFixture,
    DocumentType,
    HttpMethod,
    IdentifiedFixtureModel,
)
from src.persistence import (
    FOREIGN_KEYS,
    INSERT_ORDER,
    build_seed_plan,
    flatten_fixtures,
)

BLOG_SIDECAR: str = "documents/blog/sample-post.md"
SPEC_SIDECAR: str = "documents/specs/sample-spec.md"

BLOG_SIDECAR_CONTENT: bytes = b"# Sample Post\n\nBody.\n"
SPEC_SIDECAR_CONTENT: bytes = b"# Sample Spec\n"

TIMESTAMP: str = "2025-01-01T00:00:00Z"


def fixture_id(seed: int) -> str:
    """fixture_id renders a deterministic 32-character hex fixture identifier.

    Args:
        seed (int): The integer the identifier is rendered from.

    Returns:
        str: A 32-character lower-case hex string accepted by `FixtureId`.
    """

    return f"{seed:032x}"


def api_key_digest(seed: int) -> str:
    """api_key_digest renders a deterministic 64-character hex digest.

    Args:
        seed (int): The integer the digest is rendered from.

    Returns:
        str: A 64-character lower-case hex string accepted by `ApiKeyDigest`.
    """

    return f"{seed:064x}"


def domain_payloads() -> dict[str, list[dict[str, Any]]]:
    """domain_payloads builds one valid aggregate for every catalogue file.

    The payloads are minimal rather than representative: they exercise every
    domain file of the catalogue with the smallest object each model accepts,
    plus the two document-bearing aggregates that need a sidecar.

    Returns:
        dict[str, list[dict[str, Any]]]: The JSON payload of every domain file,
            keyed by file name.
    """

    return {
        "contacts.json": [
            {
                "id": fixture_id(1),
                "name": "Ada Lovelace",
                "email": "ada.lovelace@example.org",
                "messages": [
                    {
                        "id": fixture_id(2),
                        "content": "Hello",
                        "submitted_at": TIMESTAMP,
                    }
                ],
            }
        ],
        "blog.json": [
            {
                "id": fixture_id(3),
                "author": "Ada Lovelace",
                "title": "Sample Post",
                "description": "A sample post.",
                "authored_at": TIMESTAMP,
                "document": {
                    "id": fixture_id(4),
                    "filename": "sample-post.md",
                    "restricted": False,
                    "content": BLOG_SIDECAR,
                },
                "topics": [
                    {
                        "id": fixture_id(22),
                        "topic": {"id": fixture_id(5), "name": "golang"},
                    }
                ],
                "comments": [{"id": fixture_id(6), "comment": "Nice post."}],
            }
        ],
        "agent_specs.json": [
            {
                "id": fixture_id(7),
                "display_name": "Sample Spec",
                "description": "A sample spec.",
                "documents": [
                    {
                        "id": fixture_id(8),
                        "document_type": "spec",
                        "document": {
                            "id": fixture_id(9),
                            "filename": "sample-spec.md",
                            "restricted": False,
                            "content": SPEC_SIDECAR,
                        },
                    }
                ],
            }
        ],
        "cv_experience.json": [
            {
                "id": fixture_id(10),
                "organization": "Acme Cloud GmbH",
                "job_title": "Senior Engineer",
                "start_date": "2022-03-01",
                "description": "Built platforms.",
                "responsibilities": [
                    {"id": fixture_id(11), "description": "Ran the platform."}
                ],
                "stack_items": [
                    {
                        "id": fixture_id(12),
                        "stack_item": {"id": fixture_id(13), "name": "Go"},
                    }
                ],
            }
        ],
        "cv_skills.json": [
            {
                "id": fixture_id(14),
                "category": "Languages",
                "stack_items": [
                    {"id": fixture_id(15), "stack_item_id": fixture_id(13)}
                ],
            }
        ],
        "cv_education.json": [
            {
                "id": fixture_id(16),
                "institution": "TU Munich",
                "certificate": "MSc",
                "start_date": "2014-10-01",
            }
        ],
        "subagents.json": [
            {
                "id": fixture_id(17),
                "name": "work-planner",
                "description": "Plans work.",
            }
        ],
        "projects.json": [
            {
                "id": fixture_id(18),
                "name": "Personal Website",
                "description": "A website.",
                "primary_link": "https://example.org",
            }
        ],
        "api_keys.json": [
            {
                "id": fixture_id(19),
                "api_key": api_key_digest(20),
                "description": "Acceptance suite key.",
                "issued_at": TIMESTAMP,
                "issued_for": "acceptance-suite",
            }
        ],
        "admin_audit_log.json": [
            {
                "id": fixture_id(21),
                "api_key_id": fixture_id(19),
                "endpoint": "/v1/admin/contacts",
                "method": "get",
                "status_code": 200,
            }
        ],
    }


def write_json(root: Path, file_name: str, payload: Any) -> Path:
    """write_json writes a JSON payload to a file inside the fixtures root.

    Args:
        root (Path): The fixtures root the file is written into.
        file_name (str): Name of the file, relative to the root.
        payload (Any): The payload serialised as JSON.

    Returns:
        Path: The path of the written file.
    """

    path = root / file_name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def write_sidecar(root: Path, relative_path: str, content: bytes) -> Path:
    """write_sidecar writes a sidecar document file inside the fixtures root.

    Args:
        root (Path): The fixtures root the file is written into.
        relative_path (str): Path of the sidecar, relative to the root.
        content (bytes): The bytes written to the sidecar.

    Returns:
        Path: The path of the written sidecar file.
    """

    path = root / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


def build_tree(
    root: Path,
    payloads: dict[str, list[dict[str, Any]]] | None = None,
) -> Path:
    """build_tree writes a complete, valid synthetic fixture tree.

    Args:
        root (Path): The fixtures root the tree is written into.
        payloads (dict[str, list[dict[str, Any]]] | None): Payloads overriding
            the default valid ones; the defaults are used when omitted.

    Returns:
        Path: The fixtures root, for convenient chaining.
    """

    write_sidecar(root, BLOG_SIDECAR, BLOG_SIDECAR_CONTENT)
    write_sidecar(root, SPEC_SIDECAR, SPEC_SIDECAR_CONTENT)

    for file_name, payload in (payloads or domain_payloads()).items():
        write_json(root, file_name, payload)

    return root


def test_discover_domain_files_maps_every_catalogue_file(fixtures_root: Path) -> None:
    """test_discover_domain_files_maps_every_catalogue_file covers discovery.

    Args:
        fixtures_root (Path): The empty synthetic fixtures root.

    Returns:
        None
    """

    build_tree(fixtures_root)

    discovered = discover_domain_files(fixtures_root=fixtures_root)

    assert set(discovered) == set(DOMAIN_FIXTURE_MODELS)
    assert all(
        path == fixtures_root / file_name for file_name, path in discovered.items()
    )


def test_load_fixtures_returns_every_domain(fixtures_root: Path) -> None:
    """test_load_fixtures_returns_every_domain covers the happy path.

    Args:
        fixtures_root (Path): The empty synthetic fixtures root.

    Returns:
        None
    """

    build_tree(fixtures_root)

    loaded = load_fixtures(fixtures_root=fixtures_root)

    assert isinstance(loaded, DomainFixtures)
    assert loaded.fixtures_root == fixtures_root.resolve()
    assert set(loaded.domains) == set(DOMAIN_FIXTURE_MODELS)

    for file_name, model in DOMAIN_FIXTURE_MODELS.items():
        aggregates = loaded.domains[file_name]
        assert len(aggregates) == 1
        assert isinstance(aggregates[0], model)


def test_load_fixtures_derives_document_size(fixtures_root: Path) -> None:
    """test_load_fixtures_derives_document_size covers sidecar resolution.

    Args:
        fixtures_root (Path): The empty synthetic fixtures root.

    Returns:
        None
    """

    build_tree(fixtures_root)

    loaded = load_fixtures(fixtures_root=fixtures_root)

    document = loaded.domains["blog.json"][0].document
    assert document is not None
    assert document.content == BLOG_SIDECAR_CONTENT
    assert document.size == len(BLOG_SIDECAR_CONTENT)

    nested = loaded.domains["agent_specs.json"][0].documents[0].document
    assert nested.content == SPEC_SIDECAR_CONTENT
    assert nested.size == len(SPEC_SIDECAR_CONTENT)


def test_load_fixtures_resolves_sidecars_against_the_fixtures_root(
    fixtures_root: Path,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """test_load_fixtures_resolves_sidecars_against_the_fixtures_root covers
    root-relative resolution.

    Sidecar paths must resolve against the fixtures root rather than the process
    working directory (RISK-009), so the test runs from an unrelated directory.

    Args:
        fixtures_root (Path): The empty synthetic fixtures root.
        monkeypatch (pytest.MonkeyPatch): Used to change the working directory.
        tmp_path (Path): The per-test temporary directory.

    Returns:
        None
    """

    build_tree(fixtures_root)
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)

    loaded = load_fixtures(fixtures_root=fixtures_root)

    document = loaded.domains["blog.json"][0].document
    assert document is not None
    assert document.content == BLOG_SIDECAR_CONTENT


def test_load_fixtures_ignores_the_documents_directory(fixtures_root: Path) -> None:
    """test_load_fixtures_ignores_the_documents_directory covers sidecar scoping.

    A `.json` file nested under `documents/` is sidecar content, not a domain
    file, so it must neither be loaded nor rejected as unrecognised.

    Args:
        fixtures_root (Path): The empty synthetic fixtures root.

    Returns:
        None
    """

    build_tree(fixtures_root)
    write_json(
        fixtures_root,
        f"{DOCUMENTS_DIRECTORY_NAME}/blog/attachment{JSON_SUFFIX}",
        {"not": "a domain file"},
    )

    loaded = load_fixtures(fixtures_root=fixtures_root)

    assert set(loaded.domains) == set(DOMAIN_FIXTURE_MODELS)


def test_load_fixtures_rejects_a_missing_fixtures_root(tmp_path: Path) -> None:
    """test_load_fixtures_rejects_a_missing_fixtures_root covers a missing root.

    Args:
        tmp_path (Path): The per-test temporary directory.

    Returns:
        None
    """

    missing = tmp_path / "absent"

    with pytest.raises(FixturesRootNotFoundError) as excinfo:
        load_fixtures(fixtures_root=missing)

    assert str(missing) in str(excinfo.value)


def test_load_fixtures_rejects_a_missing_domain_file(fixtures_root: Path) -> None:
    """test_load_fixtures_rejects_a_missing_domain_file covers an absent file.

    Args:
        fixtures_root (Path): The empty synthetic fixtures root.

    Returns:
        None
    """

    payloads = domain_payloads()
    del payloads["projects.json"]
    build_tree(fixtures_root, payloads=payloads)

    with pytest.raises(MissingFixtureFileError) as excinfo:
        load_fixtures(fixtures_root=fixtures_root)

    assert "projects.json" in str(excinfo.value)


def test_load_fixtures_rejects_an_unknown_domain_file(fixtures_root: Path) -> None:
    """test_load_fixtures_rejects_an_unknown_domain_file covers an extra file.

    Args:
        fixtures_root (Path): The empty synthetic fixtures root.

    Returns:
        None
    """

    build_tree(fixtures_root)
    write_json(fixtures_root, "invoices.json", [])

    with pytest.raises(UnknownFixtureFileError) as excinfo:
        load_fixtures(fixtures_root=fixtures_root)

    assert "invoices.json" in str(excinfo.value)


def test_load_fixtures_rejects_malformed_json(fixtures_root: Path) -> None:
    """test_load_fixtures_rejects_malformed_json covers unparseable content.

    Args:
        fixtures_root (Path): The empty synthetic fixtures root.

    Returns:
        None
    """

    build_tree(fixtures_root)
    (fixtures_root / "projects.json").write_text("{not json", encoding="utf-8")

    with pytest.raises(MalformedFixtureFileError) as excinfo:
        load_fixtures(fixtures_root=fixtures_root)

    assert "projects.json" in str(excinfo.value)
    assert isinstance(excinfo.value.__cause__, json.JSONDecodeError)


def test_load_fixtures_rejects_a_domain_file_that_is_not_an_array(
    fixtures_root: Path,
) -> None:
    """test_load_fixtures_rejects_a_domain_file_that_is_not_an_array covers the
    array-of-objects contract of REQ-2.3.

    Args:
        fixtures_root (Path): The empty synthetic fixtures root.

    Returns:
        None
    """

    payloads = domain_payloads()
    build_tree(fixtures_root, payloads=payloads)
    write_json(fixtures_root, "projects.json", payloads["projects.json"][0])

    with pytest.raises(MalformedFixtureFileError) as excinfo:
        load_fixtures(fixtures_root=fixtures_root)

    assert "projects.json" in str(excinfo.value)


def test_load_fixtures_rejects_a_fixture_violating_its_model(
    fixtures_root: Path,
) -> None:
    """test_load_fixtures_rejects_a_fixture_violating_its_model covers AC-7.

    Args:
        fixtures_root (Path): The empty synthetic fixtures root.

    Returns:
        None
    """

    payloads = domain_payloads()
    payloads["projects.json"][0]["id"] = "not-a-uuid"
    build_tree(fixtures_root, payloads=payloads)

    with pytest.raises(ValidationError):
        load_fixtures(fixtures_root=fixtures_root)


def test_load_fixtures_rejects_a_missing_sidecar_document(
    fixtures_root: Path,
) -> None:
    """test_load_fixtures_rejects_a_missing_sidecar_document covers a dangling
    document path.

    Args:
        fixtures_root (Path): The empty synthetic fixtures root.

    Returns:
        None
    """

    payloads = domain_payloads()
    payloads["blog.json"][0]["document"]["content"] = "documents/blog/absent.md"
    build_tree(fixtures_root, payloads=payloads)

    with pytest.raises(ValidationError):
        load_fixtures(fixtures_root=fixtures_root)


def test_load_fixtures_rejects_a_fixture_supplied_document_size(
    fixtures_root: Path,
) -> None:
    """test_load_fixtures_rejects_a_fixture_supplied_document_size covers the
    derived-size rule of binding decision F-1.

    Args:
        fixtures_root (Path): The empty synthetic fixtures root.

    Returns:
        None
    """

    payloads = domain_payloads()
    payloads["blog.json"][0]["document"]["size"] = 12
    build_tree(fixtures_root, payloads=payloads)

    with pytest.raises(ValidationError):
        load_fixtures(fixtures_root=fixtures_root)


def test_fixture_errors_share_a_common_base() -> None:
    """test_fixture_errors_share_a_common_base covers the error hierarchy.

    Returns:
        None
    """

    for error in (
        FixturesRootNotFoundError,
        MissingFixtureFileError,
        UnknownFixtureFileError,
        MalformedFixtureFileError,
    ):
        assert issubclass(error, FixtureError)


def test_module_imports_no_database_driver() -> None:
    """test_module_imports_no_database_driver covers the AC-7 ordering rule.

    Fixture validation must provably complete before any database interaction,
    which holds structurally because `src.fixtures` imports neither a driver nor
    the configuration module that carries the connection settings.

    Returns:
        None
    """

    import src.fixtures as module

    source = Path(module.__file__).read_text(encoding="utf-8")
    imported: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            imported.add(node.module.split(".")[0])

    assert "psycopg" not in imported
    assert "config" not in imported
    assert not any(name.endswith("config") for name in imported)


# ---------------------------------------------------------------------------
# Shipped-fixture harness
#
# Everything below drives the real `scripts/seeding/fixtures/` tree through the
# real loader and the real models. The catalogue is complete, so the whole
# corpus is loaded through `load_fixtures` - the entry point the seeder itself
# uses, which insists on every catalogue file being present - and the per-domain
# tests index into that single result. The corpus tests at the end of the file
# are the authoritative check: they prove the shipped tree validates end to end,
# that every sidecar resolves, that every cross-file reference resolves, and
# that the seeder can plan the whole corpus.
# ---------------------------------------------------------------------------

# The catalogue files shipped under `scripts/seeding/fixtures/`, which is the
# complete catalogue of README section 4.
SHIPPED_DOMAINS: tuple[str, ...] = (
    "blog.json",
    "agent_specs.json",
    "subagents.json",
    "projects.json",
    "contacts.json",
    "api_keys.json",
    "admin_audit_log.json",
    "cv_experience.json",
    "cv_skills.json",
    "cv_education.json",
)

# The shipped domains that own `base.document` rows (README §5.1). Only these
# two files carry sidecars, so the sidecar assertions are parametrised over the
# subset rather than over every shipped domain.
DOCUMENT_BEARING_DOMAINS: tuple[str, ...] = ("blog.json", "agent_specs.json")

# Keys identifying a raw document payload inside a domain file (README §5.1).
DOCUMENT_KEYS: frozenset[str] = frozenset({"filename", "content"})

# Every `base.cv_stack_item` name owned by `cv_experience.json` (README §4.4).
# The set is closed: a technology that no role in the shipped CV used is not a
# stack item, and `cv_skills.json` can therefore only reference names from here.
SHIPPED_STACK_ITEM_NAMES: frozenset[str] = frozenset(
    {
        "Python",
        "Golang",
        "Claude Code",
        "Spec Driven Development",
        "Agent Sandboxing",
        "AWS",
        "Terraform",
        "Kubernetes",
        "Docker",
        "PostgreSQL",
        "DynamoDB",
        "Apache Cassandra",
        "GitHub",
        "GitHub Actions",
        "GitLab",
        "Azure DevOps",
        "IaC Pipelines",
        "REST",
        "GraphQL",
        "gRPC",
        "ETL Pipelines",
        "RabbitMQ",
        "Grafana",
        "Prometheus",
        "Agile",
        "S3",
        "Lambda",
        "ECS",
        "AppSync",
        "API Gateway",
        "Step Functions",
        "SNS",
        "SQS",
        "Athena",
        "Glue",
        "Security Hub",
        "Azure AKS",
    }
)

# The stack item `cv.feature` — "Tech stack items without a category are not
# returned as skills" names: linked to an experience, referenced by no category.
UNCATEGORISED_STACK_ITEM_NAME: str = "Athena"

# The literals of README §3.2, reserved by `Given no ... exists` steps. A
# fixture using one of them would make the owning scenario fail.
RESERVED_LITERALS: tuple[str, ...] = (
    "3f2a9c1de4b7482ba6c10e5d8c714b39",
    "9b4d2f7ac1e34d59b8a61c0f5e372d48",
    "7c1e5a9db2f6470c93d84b1a6e05c827",
    "test@example.com",
)


def shipped_domain_path(fixtures_root: Path, file_name: str) -> Path:
    """shipped_domain_path locates one shipped domain file.

    Args:
        fixtures_root (Path): Root of the shipped fixture tree.
        file_name (str): Name of the domain file.

    Returns:
        Path: The path of the shipped domain file.
    """

    return fixtures_root / file_name


def load_shipped_corpus(fixtures_root: Path) -> DomainFixtures:
    """load_shipped_corpus validates the whole shipped fixture tree.

    Args:
        fixtures_root (Path): Root of the shipped fixture tree.

    Returns:
        DomainFixtures: The validated aggregates of every catalogue file.
    """

    return load_fixtures(fixtures_root=fixtures_root)


def load_shipped_domain(
    fixtures_root: Path,
    file_name: str,
) -> list[IdentifiedFixtureModel]:
    """load_shipped_domain validates one domain of the shipped tree.

    The domain is taken from the whole-corpus load rather than read on its own,
    so every shipped assertion runs against the same entry point the seeder
    uses.

    Args:
        fixtures_root (Path): Root of the shipped fixture tree.
        file_name (str): Name of the domain file.

    Returns:
        list[IdentifiedFixtureModel]: The validated aggregates, in file order.
    """

    return load_shipped_corpus(fixtures_root).aggregates(file_name)


def shipped_aggregates(fixtures_root: Path) -> list[IdentifiedFixtureModel]:
    """shipped_aggregates returns every aggregate of the shipped corpus.

    Args:
        fixtures_root (Path): Root of the shipped fixture tree.

    Returns:
        list[IdentifiedFixtureModel]: The aggregates of every catalogue file,
            in catalogue order.
    """

    corpus = load_shipped_corpus(fixtures_root)
    return [
        aggregate
        for file_name in DOMAIN_FIXTURE_MODELS
        for aggregate in corpus.aggregates(file_name)
    ]


def iter_documents(model: IdentifiedFixtureModel) -> Iterator[DocumentFixture]:
    """iter_documents walks an aggregate for every document it owns.

    The walk is generic over the model tree, so a document nested behind a link
    model - as in `agent_specs.json` - is found without the harness knowing the
    aggregate's shape.

    Args:
        model (IdentifiedFixtureModel): The validated aggregate to walk.

    Yields:
        DocumentFixture: Every document owned by the aggregate.
    """

    for value in dict(model).values():
        candidates = value if isinstance(value, list) else [value]
        for candidate in candidates:
            if isinstance(candidate, DocumentFixture):
                yield candidate
            elif isinstance(candidate, IdentifiedFixtureModel):
                yield from iter_documents(candidate)


def iter_raw_documents(payload: Any) -> Iterator[dict[str, Any]]:
    """iter_raw_documents walks a raw JSON payload for its document objects.

    Args:
        payload (Any): A raw, unvalidated fixture payload.

    Yields:
        dict[str, Any]: Every object carrying a document's `filename` and
            sidecar `content` path.
    """

    if isinstance(payload, list):
        for item in payload:
            yield from iter_raw_documents(item)
    elif isinstance(payload, dict):
        if DOCUMENT_KEYS <= set(payload):
            yield payload
        for value in payload.values():
            yield from iter_raw_documents(value)


def nested_models(model: IdentifiedFixtureModel) -> Iterator[IdentifiedFixtureModel]:
    """nested_models yields the models embedded directly in an aggregate.

    Args:
        model (IdentifiedFixtureModel): The validated model to inspect.

    Yields:
        IdentifiedFixtureModel: Every model held by one of its fields, whether
            the field holds a single model or a list of them.
    """

    for value in dict(model).values():
        for candidate in value if isinstance(value, list) else [value]:
            if isinstance(candidate, IdentifiedFixtureModel):
                yield candidate


def collect_rows(model: IdentifiedFixtureModel) -> Iterator[tuple[str, Any]]:
    """collect_rows walks an aggregate for the table rows it defines.

    A row is identified by its primary key and described by its own scalar
    fields only: the models nested inside it are rows in their own right and are
    yielded separately, exactly as the persistence layer flattens them.

    Args:
        model (IdentifiedFixtureModel): The validated aggregate to walk.

    Yields:
        tuple[str, Any]: The primary key and the scalar payload of every row
            defined by the aggregate, itself included.
    """

    scalars = {
        name: value
        for name, value in dict(model).items()
        if not isinstance(value, IdentifiedFixtureModel)
        and not (
            isinstance(value, list)
            and any(isinstance(item, IdentifiedFixtureModel) for item in value)
        )
    }

    yield model.id, (type(model).__name__, tuple(sorted(scalars.items())))
    for nested in nested_models(model):
        yield from collect_rows(nested)


@pytest.mark.parametrize("file_name", SHIPPED_DOMAINS)
def test_shipped_domain_validates(shipped_fixtures_root: Path, file_name: str) -> None:
    """test_shipped_domain_validates covers the shipped tree against its models.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.
        file_name (str): The shipped domain file under test.

    Returns:
        None
    """

    aggregates = load_shipped_domain(shipped_fixtures_root, file_name)

    assert aggregates
    assert all(
        isinstance(aggregate, DOMAIN_FIXTURE_MODELS[file_name])
        for aggregate in aggregates
    )


@pytest.mark.parametrize("file_name", SHIPPED_DOMAINS)
def test_shipped_domain_rows_carry_consistent_hex_identifiers(
    shipped_fixtures_root: Path,
    file_name: str,
) -> None:
    """test_shipped_domain_rows_carry_consistent_hex_identifiers covers REQ-2.3.

    Every primary key in the file - link rows included - is a pre-generated
    32-character hex literal, and any key appearing more than once is a shared
    lookup whose repeated definitions are identical, so de-duplication collapses
    them rather than raising a conflict (README §5.2).

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.
        file_name (str): The shipped domain file under test.

    Returns:
        None
    """

    aggregates = load_shipped_domain(shipped_fixtures_root, file_name)
    rows = [row for aggregate in aggregates for row in collect_rows(aggregate)]

    assert rows
    assert all(len(identifier) == 32 for identifier, _ in rows)

    by_id: dict[str, Any] = {}
    for identifier, payload in rows:
        assert by_id.setdefault(identifier, payload) == payload


@pytest.mark.parametrize("file_name", SHIPPED_DOMAINS)
def test_shipped_domain_avoids_the_reserved_literals(
    shipped_fixtures_root: Path,
    file_name: str,
) -> None:
    """test_shipped_domain_avoids_the_reserved_literals covers README §3.2.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.
        file_name (str): The shipped domain file under test.

    Returns:
        None
    """

    source = shipped_domain_path(shipped_fixtures_root, file_name).read_text(
        encoding="utf-8"
    )

    assert not [literal for literal in RESERVED_LITERALS if literal in source.lower()]


@pytest.mark.parametrize("file_name", DOCUMENT_BEARING_DOMAINS)
def test_shipped_documents_have_non_empty_sidecars(
    shipped_fixtures_root: Path,
    file_name: str,
) -> None:
    """test_shipped_documents_have_non_empty_sidecars covers AC-10.

    Every document defined by a shipped domain resolves to a sidecar file that
    exists, holds bytes, and whose byte length is exactly the derived `size`.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.
        file_name (str): The shipped domain file under test.

    Returns:
        None
    """

    path = shipped_domain_path(shipped_fixtures_root, file_name)
    raw = {
        document["id"]: document
        for document in iter_raw_documents(json.loads(path.read_text(encoding="utf-8")))
    }
    documents = [
        document
        for aggregate in load_shipped_domain(shipped_fixtures_root, file_name)
        for document in iter_documents(aggregate)
    ]

    assert documents
    assert {document.id for document in documents} == set(raw)

    for document in documents:
        sidecar_path = raw[document.id]["content"]
        sidecar = shipped_fixtures_root / sidecar_path

        assert sidecar_path.startswith(f"{DOCUMENTS_DIRECTORY_NAME}/")
        assert sidecar.is_file()
        assert sidecar.stat().st_size > 0
        assert document.content == sidecar.read_bytes()
        assert document.size == sidecar.stat().st_size


@pytest.mark.parametrize("file_name", SHIPPED_DOMAINS)
def test_shipped_documents_never_supply_a_size(
    shipped_fixtures_root: Path,
    file_name: str,
) -> None:
    """test_shipped_documents_never_supply_a_size covers binding decision F-1.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.
        file_name (str): The shipped domain file under test.

    Returns:
        None
    """

    path = shipped_domain_path(shipped_fixtures_root, file_name)
    payload = json.loads(path.read_text(encoding="utf-8"))

    assert not [
        document for document in iter_raw_documents(payload) if "size" in document
    ]


def test_shipped_blog_fixtures_cover_the_catalogue(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_blog_fixtures_cover_the_catalogue covers README §4.2.

    The blog rows exist to distinguish the cases `blog.feature` asserts on, so
    the harness pins those distinctions rather than the row count alone: visible
    and hidden articles, an article with no linked document, articles with one
    and with several topics, and comments with and without an author.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    articles = load_shipped_domain(shipped_fixtures_root, "blog.json")
    by_title = {article.title: article for article in articles}
    comments = [comment for article in articles for comment in article.comments]

    assert len(by_title) == len(articles)
    assert {"Sample Post", "Draft Post"} <= set(by_title)

    assert [article for article in articles if article.display]
    assert [article for article in articles if not article.display]
    assert by_title["Draft Post"].document is None
    assert all(
        article.document is not None
        for article in articles
        if article.title != "Draft Post"
    )
    assert all(
        article.document is not None and not article.document.restricted
        for article in articles
        if article.title != "Draft Post"
    )

    assert [article for article in articles if len(article.topics) == 1]
    assert [article for article in articles if len(article.topics) > 1]

    assert [comment for comment in comments if comment.author is not None]
    assert [comment for comment in comments if comment.author is None]

    sample_post_comments = by_title["Sample Post"].comments
    created = [comment.created_at for comment in sample_post_comments]
    assert len(created) > 1
    assert all(created)
    assert created == sorted(created)
    assert len(set(created)) == len(created)

    authored = [article.authored_at for article in articles]
    assert len(set(authored)) == len(authored)


def test_shipped_blog_topics_are_consistent(shipped_fixtures_root: Path) -> None:
    """test_shipped_blog_topics_are_consistent covers the shared-lookup rule.

    Topics are a shared lookup de-duplicated on `id` (README §5.2), so every
    embedded copy of a topic must be byte identical, and each link row must
    carry its own identifier distinct from the topic it joins.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    articles = load_shipped_domain(shipped_fixtures_root, "blog.json")
    links = [link for article in articles for link in article.topics]

    assert links

    by_id: dict[str, dict[str, Any]] = {}
    for link in links:
        assert link.id != link.topic.id
        by_id.setdefault(link.topic.id, link.topic.model_dump())
        assert by_id[link.topic.id] == link.topic.model_dump()

    names = {topic["name"] for topic in by_id.values()}
    assert names == {"golang", "postgres", "terraform", "kubernetes"}
    assert len(names) == len(by_id)


def test_shipped_agent_spec_fixtures_cover_the_catalogue(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_agent_spec_fixtures_cover_the_catalogue covers README §4.3.

    The spec rows exist to distinguish the cases `agent_catalogue.feature`
    asserts on, so the harness pins those distinctions: visible and hidden
    specs, a spec with several linked documents, a spec with none, a spec whose
    only spec document is restricted, and every `document_type` value.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    specs = load_shipped_domain(shipped_fixtures_root, "agent_specs.json")
    by_name = {spec.display_name: spec for spec in specs}
    links = [link for spec in specs for link in spec.documents]

    assert len(by_name) == len(specs)
    assert {
        "Sample Spec",
        "Restricted Spec",
        "Draft Spec",
    } <= set(by_name)

    assert [spec for spec in specs if spec.display]
    assert [spec for spec in specs if not spec.display]

    assert not by_name["Draft Spec"].documents
    assert len(by_name["Sample Spec"].documents) > 1
    assert {link.document.restricted for link in by_name["Sample Spec"].documents} == {
        True,
        False,
    }
    assert all(
        link.document.restricted
        for link in by_name["Restricted Spec"].documents
        if link.document_type is DocumentType.SPEC
    )

    assert {link.document_type for link in links} == set(DocumentType)
    assert all(link.id != link.document.id for link in links)


def test_shipped_documents_are_consistent_across_domains(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_documents_are_consistent_across_domains covers README §5.2.

    `base.document` is shared between `blog.json` and `agent_specs.json`. The
    seeder de-duplicates on `id` and raises on conflicting payloads, so any
    document id defined in more than one domain must carry an identical payload.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    documents = [
        document
        for file_name in DOCUMENT_BEARING_DOMAINS
        for aggregate in load_shipped_domain(shipped_fixtures_root, file_name)
        for document in iter_documents(aggregate)
    ]

    assert documents

    by_id: dict[str, dict[str, Any]] = {}
    for document in documents:
        assert by_id.setdefault(document.id, document.model_dump()) == (
            document.model_dump()
        )

    filenames = {document["filename"] for document in by_id.values()}
    assert len(filenames) == len(by_id)


def test_shipped_subagent_fixtures_cover_the_catalogue(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_subagent_fixtures_cover_the_catalogue covers README §4.7.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    subagents = load_shipped_domain(shipped_fixtures_root, "subagents.json")
    by_name = {subagent.name: subagent for subagent in subagents}

    assert len(by_name) == len(subagents)
    assert "Sample Agent" in by_name

    undeclared = by_name["Sample Agent"]
    assert undeclared.inputs is None
    assert undeclared.outputs is None

    declared = [
        subagent
        for subagent in subagents
        if subagent.inputs is not None and subagent.outputs is not None
    ]
    assert len(declared) > 1


def test_shipped_project_fixtures_cover_the_catalogue(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_project_fixtures_cover_the_catalogue covers README §4.8.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    projects = load_shipped_domain(shipped_fixtures_root, "projects.json")
    by_name = {project.name: project for project in projects}

    assert len(by_name) == len(projects)
    assert "Sample Project" in by_name
    assert by_name["Sample Project"].github_link is None

    assert [project for project in projects if project.display]
    assert [project for project in projects if not project.display]
    assert [project for project in projects if project.github_link is not None]

    links = [project.primary_link for project in projects] + [
        project.github_link for project in projects if project.github_link is not None
    ]
    assert all(link.startswith("https://") for link in links)


def test_shipped_contact_fixtures_cover_the_catalogue(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_contact_fixtures_cover_the_catalogue covers README §4.1.

    The contact rows exist to distinguish the cases `contacts.feature` asserts
    on, so the harness pins those distinctions: a contact with and one without an
    organization, messages in both `read` states, more than one contact carrying
    messages, and a distinct `submitted_at` on every message so that the
    descending-order assertion is deterministic against seed data.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    contacts = load_shipped_domain(shipped_fixtures_root, "contacts.json")
    messages = [message for contact in contacts for message in contact.messages]
    emails = [contact.email for contact in contacts]

    assert len(set(emails)) == len(emails)
    assert all(email == email.lower() for email in emails)

    assert [contact for contact in contacts if contact.organization is not None]
    assert [contact for contact in contacts if contact.organization is None]
    assert len([contact for contact in contacts if contact.messages]) > 1

    assert [message for message in messages if message.read]
    assert [message for message in messages if not message.read]

    submitted = [message.submitted_at for message in messages]
    assert len(set(submitted)) == len(submitted)


def test_shipped_api_key_fixtures_cover_the_catalogue(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_api_key_fixtures_cover_the_catalogue covers README §4.9.

    Every `@spec-004` scenario opens by presenting a valid, an expired, an
    invalid or no API key, so the fixtures must carry a key that never expires,
    one that has already expired, and one whose expiry is in the future - the
    last of which is what makes an expiry check comparing against `now()`
    distinguishable from one merely testing `expires_at IS NULL`. Keys are
    stored as SHA-256 digests (F-9b), never as plaintext.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    keys = load_shipped_domain(shipped_fixtures_root, "api_keys.json")
    digests = [key.api_key for key in keys]
    now = datetime.now(timezone.utc)

    assert len(set(digests)) == len(digests)
    assert all(re.fullmatch(API_KEY_PATTERN, digest) for digest in digests)

    assert [key for key in keys if key.expires_at is None]
    assert [key for key in keys if key.expires_at is not None and key.expires_at < now]
    assert [key for key in keys if key.expires_at is not None and key.expires_at > now]


def test_shipped_audit_log_fixtures_cover_the_catalogue(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_audit_log_fixtures_cover_the_catalogue covers README §4.10.

    No scenario presupposes a pre-existing audit-log row, so the rows exist to
    satisfy REQ-2.3 and to prove the `api_key` to audit-log path: an
    authenticated request, an unauthenticated one carrying a null `api_key_id`,
    and both the populated and the empty `payload`/`response` cases.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    entries = load_shipped_domain(shipped_fixtures_root, "admin_audit_log.json")

    assert all(entry.method in set(HttpMethod) for entry in entries)
    assert all(100 <= entry.status_code <= 599 for entry in entries)

    assert [entry for entry in entries if entry.api_key_id is None]
    assert [entry for entry in entries if entry.api_key_id is not None]
    assert [entry for entry in entries if entry.payload is not None]
    assert [
        entry for entry in entries if entry.payload is None and entry.response is None
    ]


def test_shipped_audit_log_references_resolve_to_an_api_key(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_audit_log_references_resolve_to_an_api_key covers README §4.10.

    `admin_audit_log.json` references API keys by ID only - `api_keys.json` owns
    every `base.api_key` row - so a non-null reference that no key defines is a
    linking error before any database interaction (RISK-008).

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    key_ids = {
        key.id for key in load_shipped_domain(shipped_fixtures_root, "api_keys.json")
    }
    entries = load_shipped_domain(shipped_fixtures_root, "admin_audit_log.json")
    referenced = {entry.api_key_id for entry in entries if entry.api_key_id is not None}

    assert referenced
    assert referenced <= key_ids

    payload = json.loads(
        shipped_domain_path(shipped_fixtures_root, "admin_audit_log.json").read_text(
            encoding="utf-8"
        )
    )
    assert not [entry for entry in payload if "api_key" in entry]


def test_shipped_cv_experience_fixtures_cover_the_catalogue(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_cv_experience_fixtures_cover_the_catalogue covers README §4.4.

    The experience rows exist to distinguish the cases `cv.feature` asserts on,
    so the harness pins those distinctions: at least one ongoing role with a null
    `end_date`, distinct start dates so the descending-order assertion is
    unambiguous, and the two entries `cv.feature` names by title carrying what
    their scenarios assert on.

    The corpus is the site owner's real CV (README §4.4), which holds **two**
    concurrent ongoing roles, so the ongoing count is a lower bound rather than
    the exact `1` it was while the corpus was synthetic.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    experiences = load_shipped_domain(shipped_fixtures_root, "cv_experience.json")
    by_title = {experience.job_title: experience for experience in experiences}

    assert len(by_title) == len(experiences)
    assert {"Technical Lead", "Founder & Developer"} <= set(by_title)

    # "Experience entries are returned as complete aggregates" names this entry.
    aggregate = by_title["Technical Lead"]
    assert len(aggregate.responsibilities) > 1
    assert len(aggregate.stack_items) > 1

    # "An ongoing role is returned as current" names this entry.
    assert by_title["Founder & Developer"].end_date is None

    ongoing = [experience for experience in experiences if experience.end_date is None]
    assert ongoing
    assert all(
        experience.end_date is None or experience.start_date < experience.end_date
        for experience in experiences
    )
    assert all(experience.responsibilities for experience in experiences)
    assert all(experience.stack_items for experience in experiences)

    starts = [experience.start_date for experience in experiences]
    assert len(set(starts)) == len(starts) > 2


def test_shipped_cv_experience_owns_every_stack_item(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_cv_experience_owns_every_stack_item covers README §5.2, A-1.

    `cv_experience.json` owns every `base.cv_stack_item` row, so each embedded
    copy of a stack item must be identical for de-duplication to collapse it,
    each link must carry its own identifier, and no pair may be linked twice.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    experiences = load_shipped_domain(shipped_fixtures_root, "cv_experience.json")
    links = [
        (experience.id, link)
        for experience in experiences
        for link in experience.stack_items
    ]

    assert links

    by_id: dict[str, dict[str, Any]] = {}
    for _, link in links:
        assert link.id != link.stack_item.id
        by_id.setdefault(link.stack_item.id, link.stack_item.model_dump())
        assert by_id[link.stack_item.id] == link.stack_item.model_dump()

    names = {item["name"] for item in by_id.values()}
    assert names == SHIPPED_STACK_ITEM_NAMES
    assert len(names) == len(by_id)

    pairs = [(experience_id, link.stack_item.id) for experience_id, link in links]
    assert len(set(pairs)) == len(pairs)


def test_shipped_cv_skills_reference_stack_items_by_id_only(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_cv_skills_reference_stack_items_by_id_only covers README §4.5.

    `cv_skills.json` never defines a stack item: it references the rows owned by
    `cv_experience.json` by ID, every reference resolves, and `Athena` is
    referenced by no category so that the uncategorised-skill scenario stays
    meaningful.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    experiences = load_shipped_domain(shipped_fixtures_root, "cv_experience.json")
    stack_items = {
        link.stack_item.id: link.stack_item.name
        for experience in experiences
        for link in experience.stack_items
    }
    categories = load_shipped_domain(shipped_fixtures_root, "cv_skills.json")
    by_category = {category.category: category for category in categories}
    referenced = {
        link.stack_item_id for category in categories for link in category.stack_items
    }

    assert len(by_category) == len(categories) > 2
    assert {
        "Core Languages",
        "Cloud and Infrastructure",
        "Database Technologies",
    } <= set(by_category)
    assert referenced
    assert referenced <= set(stack_items)
    assert {
        stack_items[link.stack_item_id]
        for link in by_category["Core Languages"].stack_items
    } == {
        "Golang",
        "Python",
    }
    assert "Kubernetes" in {
        stack_items[link.stack_item_id]
        for link in by_category["Cloud and Infrastructure"].stack_items
    }
    assert UNCATEGORISED_STACK_ITEM_NAME not in {
        stack_items[identifier] for identifier in referenced
    }

    payload = json.loads(
        shipped_domain_path(shipped_fixtures_root, "cv_skills.json").read_text(
            encoding="utf-8"
        )
    )
    assert not [
        link
        for category in payload
        for link in category["stack_items"]
        if "stack_item" in link
    ]


def test_cv_skills_defining_a_stack_item_is_a_validation_error(
    shipped_fixtures_root: Path,
) -> None:
    """test_cv_skills_defining_a_stack_item_is_a_validation_error covers RISK-008.

    Ownership is enforced by the model rather than by convention: a skills
    fixture that inlines the stack item it references is rejected before any
    database interaction.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    payload = json.loads(
        shipped_domain_path(shipped_fixtures_root, "cv_skills.json").read_text(
            encoding="utf-8"
        )
    )
    link = payload[0]["stack_items"][0]
    link["stack_item"] = {"id": link["stack_item_id"], "name": "Go"}

    with pytest.raises(ValidationError):
        DOMAIN_FIXTURE_MODELS["cv_skills.json"].from_fixture(
            payload[0], fixtures_root=shipped_fixtures_root
        )


def test_shipped_cv_education_fixtures_cover_the_catalogue(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_cv_education_fixtures_cover_the_catalogue covers README §4.6.

    The corpus is the site owner's real education history, which is a single
    completed degree. The count and the nullable-`end_date` case the synthetic
    corpus pinned here are therefore gone: `cv.feature` — "Entries are ordered by
    start date, most recent first" cannot be satisfied from seed data on the
    education side and is set up by the step definitions instead (README §4.6).
    What remains pinned is what the corpus can still guarantee: every entry
    validates, start dates are distinct, and no entry ends before it starts.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    entries = load_shipped_domain(shipped_fixtures_root, "cv_education.json")
    starts = [entry.start_date for entry in entries]

    assert entries
    assert all(
        entry.end_date is None or entry.start_date < entry.end_date for entry in entries
    )
    assert len(set(starts)) == len(starts)


# ---------------------------------------------------------------------------
# Whole-corpus tests
#
# The capstone of the fixture corpus: the complete shipped tree, loaded through
# the real loader and planned by the real persistence layer.
# ---------------------------------------------------------------------------


def test_shipped_fixtures_directory_matches_the_catalogue(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_fixtures_directory_matches_the_catalogue covers RISK-005.

    The shipped tree and the catalogue of README §4 must not drift: the
    directory holds exactly the ten catalogue files plus the sidecar directory,
    and nothing else.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    entries = {entry.name for entry in shipped_fixtures_root.iterdir()}
    domain_files = {
        entry.name for entry in shipped_fixtures_root.glob(f"*{JSON_SUFFIX}")
    }

    assert domain_files == set(DOMAIN_FIXTURE_MODELS)
    assert set(SHIPPED_DOMAINS) == set(DOMAIN_FIXTURE_MODELS)
    assert entries == domain_files | {DOCUMENTS_DIRECTORY_NAME}


def test_shipped_corpus_validates_through_the_loader(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_corpus_validates_through_the_loader covers AC-6.

    `load_fixtures` insists on the complete catalogue, so a single successful
    call proves that every catalogue-named file is present and that every
    aggregate in it satisfies its model.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    corpus = load_shipped_corpus(shipped_fixtures_root)

    assert corpus.fixtures_root == shipped_fixtures_root.resolve()
    assert set(corpus.domains) == set(DOMAIN_FIXTURE_MODELS)

    for file_name, model in DOMAIN_FIXTURE_MODELS.items():
        aggregates = corpus.aggregates(file_name)
        assert aggregates
        assert all(isinstance(aggregate, model) for aggregate in aggregates)


def test_shipped_corpus_identifiers_are_unique_hex_literals(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_corpus_identifiers_are_unique_hex_literals covers REQ-2.3.

    Across the whole corpus every primary key is a 32-character hex literal, and
    any key defined more than once - a shared `base.document` or
    `base.cv_stack_item` row - carries an identical payload everywhere it
    appears, so de-duplication collapses it instead of raising a conflict.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    rows = [
        row
        for aggregate in shipped_aggregates(shipped_fixtures_root)
        for row in collect_rows(aggregate)
    ]

    assert rows

    by_id: dict[str, Any] = {}
    for identifier, payload in rows:
        assert re.fullmatch(r"[0-9a-f]{32}", identifier)
        assert by_id.setdefault(identifier, payload) == payload


def test_shipped_corpus_documents_resolve_to_non_empty_sidecars(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_corpus_documents_resolve_to_non_empty_sidecars covers AC-10.

    Every document of the whole corpus holds the bytes of a sidecar file that
    exists and is non-empty, and its derived `size` is exactly that file's byte
    length. The sidecar tree carries no orphan either: every file under
    `documents/` is referenced by a document row.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    documents = [
        document
        for aggregate in shipped_aggregates(shipped_fixtures_root)
        for document in iter_documents(aggregate)
    ]
    raw = {
        document["id"]: document["content"]
        for file_name in DOMAIN_FIXTURE_MODELS
        for document in iter_raw_documents(
            json.loads(
                shipped_domain_path(shipped_fixtures_root, file_name).read_text(
                    encoding="utf-8"
                )
            )
        )
    }

    assert documents
    assert {document.id for document in documents} == set(raw)

    for document in documents:
        sidecar = shipped_fixtures_root / raw[document.id]

        assert raw[document.id].startswith(f"{DOCUMENTS_DIRECTORY_NAME}/")
        assert sidecar.is_file()
        assert document.content
        assert document.content == sidecar.read_bytes()
        assert document.size == sidecar.stat().st_size

    referenced = {shipped_fixtures_root / path for path in raw.values()}
    on_disk = {
        path
        for path in (shipped_fixtures_root / DOCUMENTS_DIRECTORY_NAME).rglob("*")
        if path.is_file()
    }
    assert on_disk == referenced


def test_shipped_corpus_builds_a_seed_plan(shipped_fixtures_root: Path) -> None:
    """test_shipped_corpus_builds_a_seed_plan covers AC-6 over the whole corpus.

    Planning the complete corpus exercises flattening, de-duplication and
    reference resolution together: it succeeds, it covers every table of the
    schema, and its insert order is `INSERT_ORDER` - the FK-safe order written
    down independently in README §6 - filtered to the seeded tables.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    plan = build_seed_plan(shipped_aggregates(shipped_fixtures_root))

    assert set(plan.rows) == set(INSERT_ORDER)
    assert plan.insert_order == INSERT_ORDER
    assert plan.truncate_order == tuple(reversed(INSERT_ORDER))
    assert all(plan.rows[table] for table in plan.insert_order)


def test_shipped_corpus_shared_rows_deduplicate_without_conflict(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_corpus_shared_rows_deduplicate_without_conflict covers §5.2.

    Both shared-lookup tables reach the planner carrying more rows than they
    insert: `base.cv_stack_item` is embedded once per experience using the item,
    and `base.document` is written from two different domain files. Planning
    collapses each shared row to exactly one insert and raises no conflict,
    which only holds while every repeated definition is identical.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    corpus = load_shipped_corpus(shipped_fixtures_root)
    aggregates = shipped_aggregates(shipped_fixtures_root)
    flattened = flatten_fixtures(aggregates)
    plan = build_seed_plan(aggregates)

    for table in ("document", "cv_stack_item"):
        identifiers = [row["id"] for row in flattened[table]]

        assert identifiers
        assert len(plan.rows[table]) == len(set(identifiers))
        assert {row["id"] for row in plan.rows[table]} == set(identifiers)

    stack_items = [row["id"] for row in flattened["cv_stack_item"]]
    assert len(stack_items) > len(set(stack_items))

    contributors = [
        file_name
        for file_name in DOCUMENT_BEARING_DOMAINS
        if any(
            document
            for aggregate in corpus.aggregates(file_name)
            for document in iter_documents(aggregate)
        )
    ]
    assert len(contributors) > 1


def test_shipped_corpus_cross_file_references_resolve(
    shipped_fixtures_root: Path,
) -> None:
    """test_shipped_corpus_cross_file_references_resolve covers RISK-008.

    Every foreign key of the flattened corpus - restored from a parent
    aggregate or referenced by ID across files, such as a skill category naming
    a stack item owned by `cv_experience.json` or an audit-log entry naming an
    API key owned by `api_keys.json` - names a row the corpus defines.

    Args:
        shipped_fixtures_root (Path): The real `scripts/seeding/fixtures/` tree.

    Returns:
        None
    """

    plan = build_seed_plan(shipped_aggregates(shipped_fixtures_root))
    known = {table: {row["id"] for row in rows} for table, rows in plan.rows.items()}

    checked = 0
    for table, foreign_keys in FOREIGN_KEYS.items():
        for column, target in foreign_keys:
            for row in plan.rows[table]:
                value = row[column]
                if value is None:
                    continue

                assert value in known[target]
                checked += 1

    assert checked
    assert {
        row["stack_item_id"] for row in plan.rows["cv_stack_item_category_link"]
    } <= known["cv_stack_item"]
    assert {
        row["api_key_id"]
        for row in plan.rows["admin_audit_log"]
        if row["api_key_id"] is not None
    } <= known["api_key"]
    assert {
        row["document_id"] for row in plan.rows["agent_spec_document_link"]
    } <= known["document"]
