"""Unit tests for the seeding component persistence layer.

The suite pins the pure half of `src/persistence.py`: flattening validated domain
aggregates into per-table rows, de-duplicating shared lookup rows, resolving every
cross-file ID reference, deriving the truncate set, ordering the inserts
FK-safely, and building the parameterised statements. It also pins the executor,
`execute_seed_plan`, against the recording fake connection of `conftest.py`: the
recorded call sequence must show every statement inside one transaction block,
each seeded table truncated exactly once before its first insert, the inserts in
FK-safe order, exactly one commit on success and none on failure (REQ-2.5, AC-7).

RISK-007: the FK-safe insert order is asserted against `README_INSERT_ORDER`
below, which is copied by hand from `scripts/seeding/README.md` §6. The constant
is deliberately *not* imported from the implementation, so the two remain
independent statements of the same fact.

RISK-008: de-duplication is asserted in all three cases - identical duplicates
collapse, conflicting duplicates raise, distinct rows are both kept - for both
shared lookup tables (`base.document` and `base.cv_stack_item`).

NO-SERVER RULE: no PostgreSQL server is started or contacted. The planning
functions are pure and the executor is driven entirely by the recording fake
connection, so the suite passes with no `postgres` executable present.
"""

from __future__ import annotations

import inspect
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest
from psycopg.types.json import Jsonb

SEEDING_ROOT: Path = Path(__file__).resolve().parent.parent
if str(SEEDING_ROOT) not in sys.path:
    sys.path.insert(0, str(SEEDING_ROOT))

from src.models import (  # noqa: E402
    AdminAuditLogFixture,
    AgentSpecFixture,
    ApiKeyFixture,
    ArticleFixture,
    ContactFixture,
    CvEducationFixture,
    CvExperienceFixture,
    CvSkillCategoryFixture,
    ProjectFixture,
    SubagentFixture,
)
from src import persistence  # noqa: E402
from src.persistence import (  # noqa: E402
    ConflictingFixtureRowError,
    UnresolvedReferenceError,
    build_insert_statements,
    build_seed_plan,
    build_truncate_statements,
    execute_seed_plan,
    flatten_fixture,
    flatten_fixtures,
)

import conftest  # noqa: E402

# The FK-safe insert order, transcribed by hand from scripts/seeding/README.md
# section 6. Never import this from the implementation (RISK-007).
README_INSERT_ORDER: tuple[str, ...] = (
    "contact",
    "message",
    "topic",
    "document",
    "article",
    "topic_article_link",
    "article_comment",
    "subagent",
    "cv_stack_item",
    "cv_experience",
    "cv_experience_responsibility",
    "cv_stack_item_experience_link",
    "cv_education",
    "api_key",
    "admin_audit_log",
    "agent_spec",
    "agent_spec_document_link",
    "cv_skill_category",
    "cv_stack_item_category_link",
    "project",
)

# Every ordering constraint the revision's foreign-key graph imposes, as
# (parent, child) pairs that the insert order must respect.
REQUIRED_ORDER_PAIRS: tuple[tuple[str, str], ...] = (
    ("contact", "message"),
    ("document", "article"),
    ("topic", "topic_article_link"),
    ("article", "topic_article_link"),
    ("article", "article_comment"),
    ("cv_experience", "cv_experience_responsibility"),
    ("cv_stack_item", "cv_stack_item_experience_link"),
    ("cv_experience", "cv_stack_item_experience_link"),
    ("api_key", "admin_audit_log"),
    ("agent_spec", "agent_spec_document_link"),
    ("document", "agent_spec_document_link"),
    ("cv_skill_category", "cv_stack_item_category_link"),
    ("cv_stack_item", "cv_stack_item_category_link"),
)

SUBMITTED_AT: datetime = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
AUTHORED_AT: datetime = datetime(2026, 2, 3, 4, 5, 6, tzinfo=timezone.utc)
COMMENTED_AT: datetime = datetime(2026, 3, 4, 5, 6, 7, tzinfo=timezone.utc)
ISSUED_AT: datetime = datetime(2026, 4, 5, 6, 7, 8, tzinfo=timezone.utc)

API_KEY_DIGEST: str = "a" * 64


def fixture_id(value: int) -> str:
    """fixture_id builds a deterministic 32-character hex fixture identifier.

    Args:
        value (int): Seed of the identifier, rendered as zero-padded hex.

    Returns:
        str: A 32-character lower-case hex string accepted by `FixtureId`.
    """

    return f"{value:032x}"


def write_sidecar(fixtures_root: Path, relative: str, content: bytes) -> str:
    """write_sidecar writes a document sidecar file into a fixtures tree.

    Args:
        fixtures_root (Path): Root the relative path is resolved against.
        relative (str): Path of the sidecar file, relative to the root.
        content (bytes): Bytes written to the file.

    Returns:
        str: The relative path, as a fixture `content` value would carry it.
    """

    target = fixtures_root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return relative


def document_payload(
    fixtures_root: Path,
    identifier: str,
    relative: str,
    content: bytes,
    restricted: bool = False,
) -> dict[str, Any]:
    """document_payload builds a raw document fixture payload.

    Args:
        fixtures_root (Path): Root the sidecar file is written into.
        identifier (str): Primary key of the document row.
        relative (str): Sidecar path relative to the fixtures root.
        content (bytes): Bytes written to the sidecar file.
        restricted (bool): Value of the document's `restricted` column.

    Returns:
        dict[str, Any]: The unvalidated document payload.
    """

    return {
        "id": identifier,
        "filename": Path(relative).name,
        "restricted": restricted,
        "content": write_sidecar(fixtures_root, relative, content),
    }


def contact_fixture() -> ContactFixture:
    """contact_fixture builds a validated contact aggregate with one message.

    Returns:
        ContactFixture: A contact carrying a single message.
    """

    return ContactFixture.model_validate(
        {
            "id": fixture_id(1),
            "name": "Ada Lovelace",
            "email": "ada.lovelace@example.org",
            "organization": None,
            "messages": [
                {
                    "id": fixture_id(2),
                    "content": "Hello there",
                    "read": True,
                    "submitted_at": SUBMITTED_AT,
                }
            ],
        }
    )


def article_fixture(fixtures_root: Path) -> ArticleFixture:
    """article_fixture builds a validated blog aggregate covering five tables.

    Args:
        fixtures_root (Path): Root the article's sidecar file is written into.

    Returns:
        ArticleFixture: An article with a document, two topics and two comments.
    """

    return ArticleFixture.from_fixture(
        {
            "id": fixture_id(0x10),
            "author": "Ada Lovelace",
            "title": "Sample Post",
            "description": "A sample post.",
            "display": True,
            "authored_at": AUTHORED_AT,
            "document": document_payload(
                fixtures_root,
                fixture_id(0x11),
                "documents/blog/sample-post.md",
                b"# Sample Post\n",
            ),
            "topics": [
                {
                    "id": fixture_id(0x16),
                    "topic": {
                        "id": fixture_id(0x12),
                        "name": "golang",
                        "description": None,
                    },
                },
                {
                    "id": fixture_id(0x17),
                    "topic": {
                        "id": fixture_id(0x13),
                        "name": "postgres",
                        "description": "PG",
                    },
                },
            ],
            "comments": [
                {
                    "id": fixture_id(0x14),
                    "comment": "Nice post",
                    "author": "John Doe",
                    "created_at": COMMENTED_AT,
                },
                {"id": fixture_id(0x15), "comment": "Anonymous", "author": None},
            ],
        },
        fixtures_root=fixtures_root,
    )


def agent_spec_fixture(fixtures_root: Path) -> AgentSpecFixture:
    """agent_spec_fixture builds a validated spec aggregate with one document.

    Args:
        fixtures_root (Path): Root the spec's sidecar file is written into.

    Returns:
        AgentSpecFixture: A spec carrying a single document link.
    """

    return AgentSpecFixture.from_fixture(
        {
            "id": fixture_id(0x20),
            "display_name": "Sample Spec",
            "description": "A sample spec.",
            "display": True,
            "documents": [
                {
                    "id": fixture_id(0x21),
                    "document_type": "spec",
                    "document": document_payload(
                        fixtures_root,
                        fixture_id(0x22),
                        "documents/specs/sample-spec.md",
                        b"# Sample Spec\n",
                    ),
                }
            ],
        },
        fixtures_root=fixtures_root,
    )


def cv_experience_fixture() -> CvExperienceFixture:
    """cv_experience_fixture builds a validated CV experience aggregate.

    Returns:
        CvExperienceFixture: An experience with one responsibility and one stack
            item.
    """

    return CvExperienceFixture.model_validate(
        {
            "id": fixture_id(0x30),
            "organization": "Acme Cloud GmbH",
            "job_title": "Senior Engineer",
            "start_date": "2022-03-01",
            "end_date": None,
            "description": "Platform work.",
            "responsibilities": [
                {"id": fixture_id(0x31), "description": "Ran the platform."}
            ],
            "stack_items": [
                {
                    "id": fixture_id(0x32),
                    "stack_item": {"id": fixture_id(0x33), "name": "Go"},
                }
            ],
        }
    )


def cv_skill_category_fixture(stack_item_id: str) -> CvSkillCategoryFixture:
    """cv_skill_category_fixture builds a validated skill category aggregate.

    Args:
        stack_item_id (str): ID of the stack item the category references.

    Returns:
        CvSkillCategoryFixture: A category referencing one stack item by ID.
    """

    return CvSkillCategoryFixture.model_validate(
        {
            "id": fixture_id(0x40),
            "category": "Languages",
            "stack_items": [
                {"id": fixture_id(0x41), "stack_item_id": stack_item_id},
            ],
        }
    )


def api_key_fixture() -> ApiKeyFixture:
    """api_key_fixture builds a validated API-key aggregate.

    Returns:
        ApiKeyFixture: An API key that never expires.
    """

    return ApiKeyFixture.model_validate(
        {
            "id": fixture_id(0x50),
            "api_key": API_KEY_DIGEST,
            "description": "Acceptance suite key.",
            "issued_at": ISSUED_AT,
            "expires_at": None,
            "issued_for": "acceptance-suite",
        }
    )


def audit_log_fixture(api_key_id: str | None) -> AdminAuditLogFixture:
    """audit_log_fixture builds a validated audit-log aggregate.

    Args:
        api_key_id (str | None): ID of the referenced API key, or None for an
            unauthenticated request.

    Returns:
        AdminAuditLogFixture: An audit-log row.
    """

    return AdminAuditLogFixture.model_validate(
        {
            "id": fixture_id(0x60),
            "api_key_id": api_key_id,
            "endpoint": "/v1/admin/contacts",
            "method": "get",
            "status_code": 200,
            "payload": None,
            "response": {"count": 3},
        }
    )


def complete_fixtures(fixtures_root: Path) -> list[Any]:
    """complete_fixtures builds one aggregate of every domain except projects.

    The project domain is deliberately omitted so that `base.project` is a
    provably zero-row table.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.

    Returns:
        list[Any]: One validated aggregate per covered domain.
    """

    experience = cv_experience_fixture()
    stack_item_id = experience.stack_items[0].stack_item.id
    return [
        contact_fixture(),
        article_fixture(fixtures_root),
        agent_spec_fixture(fixtures_root),
        experience,
        cv_skill_category_fixture(stack_item_id),
        CvEducationFixture.model_validate(
            {
                "id": fixture_id(0x70),
                "institution": "TU Munich",
                "certificate": "MSc",
                "start_date": "2014-10-01",
                "end_date": "2016-07-31",
            }
        ),
        SubagentFixture.model_validate(
            {
                "id": fixture_id(0x80),
                "name": "work-planner",
                "description": "Plans work.",
                "inputs": {"type": "object"},
                "outputs": None,
            }
        ),
        api_key_fixture(),
        audit_log_fixture(fixture_id(0x50)),
    ]


def test_flatten_fixture_contact() -> None:
    """test_flatten_fixture_contact flattens a contact and its messages."""

    rows = flatten_fixture(contact_fixture())

    assert rows == {
        "contact": [
            {
                "id": fixture_id(1),
                "name": "Ada Lovelace",
                "email": "ada.lovelace@example.org",
                "organization": None,
            }
        ],
        "message": [
            {
                "id": fixture_id(2),
                "contact_id": fixture_id(1),
                "content": "Hello there",
                "read": True,
                "submitted_at": SUBMITTED_AT,
            }
        ],
    }


def test_flatten_fixture_article(fixtures_root: Path) -> None:
    """test_flatten_fixture_article flattens a blog aggregate to five tables.

    Args:
        fixtures_root (Path): Root the document sidecar file is written into.
    """

    rows = flatten_fixture(article_fixture(fixtures_root))

    assert set(rows) == {
        "document",
        "topic",
        "article",
        "topic_article_link",
        "article_comment",
    }
    assert rows["document"] == [
        {
            "id": fixture_id(0x11),
            "filename": "sample-post.md",
            "size": len(b"# Sample Post\n"),
            "restricted": False,
            "content": b"# Sample Post\n",
        }
    ]
    assert rows["article"] == [
        {
            "id": fixture_id(0x10),
            "author": "Ada Lovelace",
            "display": True,
            "title": "Sample Post",
            "description": "A sample post.",
            "document_id": fixture_id(0x11),
            "authored_at": AUTHORED_AT,
        }
    ]
    assert rows["topic"] == [
        {"id": fixture_id(0x12), "name": "golang", "description": None},
        {"id": fixture_id(0x13), "name": "postgres", "description": "PG"},
    ]
    assert rows["topic_article_link"] == [
        {
            "id": fixture_id(0x16),
            "topic_id": fixture_id(0x12),
            "article_id": fixture_id(0x10),
        },
        {
            "id": fixture_id(0x17),
            "topic_id": fixture_id(0x13),
            "article_id": fixture_id(0x10),
        },
    ]
    assert rows["article_comment"] == [
        {
            "id": fixture_id(0x14),
            "comment": "Nice post",
            "author": "John Doe",
            "article_id": fixture_id(0x10),
            "created_at": COMMENTED_AT,
        },
        {
            "id": fixture_id(0x15),
            "comment": "Anonymous",
            "author": None,
            "article_id": fixture_id(0x10),
        },
    ]


def test_flatten_fixture_article_link_ids_come_from_the_fixture(
    fixtures_root: Path,
) -> None:
    """test_flatten_fixture_article_link_ids_come_from_the_fixture pins link IDs.

    `base.topic_article_link` rows carry the ID their fixture supplies, exactly
    like every other link table: no primary key is derived from the values it
    joins (SPEC-001 §6.1, REQ-2.3).

    Args:
        fixtures_root (Path): Root the document sidecar file is written into.
    """

    fixture = article_fixture(fixtures_root)

    rows = flatten_fixture(fixture)["topic_article_link"]

    assert [row["id"] for row in rows] == [link.id for link in fixture.topics]


def fixture_identifiers(value: Any) -> set[str]:
    """fixture_identifiers collects every `id` a validated aggregate declares.

    Args:
        value (Any): A validated aggregate, or any value reached inside one.

    Returns:
        set[str]: Every value the payload carries under an `id` key, at any
            nesting depth.
    """

    if hasattr(value, "model_dump"):
        return fixture_identifiers(value.model_dump())

    if isinstance(value, dict):
        identifiers = {
            item for nested in value.values() for item in fixture_identifiers(nested)
        }
        identifier = value.get("id")
        return identifiers | ({identifier} if isinstance(identifier, str) else set())

    if isinstance(value, list):
        return {item for nested in value for item in fixture_identifiers(nested)}

    return set()


def test_no_row_carries_a_derived_identifier(fixtures_root: Path) -> None:
    """test_no_row_carries_a_derived_identifier pins REQ-2.3 across every table.

    Every primary key written by the seeder is a fixture-supplied UUIDv7 hex
    literal. No table's ID is computed - by hashing the joined IDs or otherwise -
    so every ID in the plan must appear verbatim in the fixtures it came from.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    fixtures = complete_fixtures(fixtures_root)
    declared = {
        identifier
        for fixture in fixtures
        for identifier in fixture_identifiers(fixture)
    }

    plan = build_seed_plan(fixtures)

    produced = {row["id"] for rows in plan.rows.values() for row in rows}
    assert produced
    assert produced <= declared


def test_persistence_module_uses_no_hash_function() -> None:
    """test_persistence_module_uses_no_hash_function forbids hashed identifiers.

    A weak digest such as MD5 is neither a UUIDv7 nor a fixture-supplied value,
    so the planning module must not reach for one at all.
    """

    source = Path(persistence.__file__).read_text(encoding="utf-8")

    assert "hashlib" not in source
    assert "md5" not in source
    assert not hasattr(persistence, "link_id")


def test_flatten_fixture_agent_spec(fixtures_root: Path) -> None:
    """test_flatten_fixture_agent_spec flattens a spec, its links and documents.

    Args:
        fixtures_root (Path): Root the document sidecar file is written into.
    """

    rows = flatten_fixture(agent_spec_fixture(fixtures_root))

    assert set(rows) == {"document", "agent_spec", "agent_spec_document_link"}
    assert rows["agent_spec"] == [
        {
            "id": fixture_id(0x20),
            "display_name": "Sample Spec",
            "description": "A sample spec.",
            "display": True,
        }
    ]
    assert rows["agent_spec_document_link"] == [
        {
            "id": fixture_id(0x21),
            "spec_id": fixture_id(0x20),
            "document_id": fixture_id(0x22),
            "document_type": "spec",
        }
    ]
    assert rows["document"][0]["id"] == fixture_id(0x22)


def test_flatten_fixture_cv_experience() -> None:
    """test_flatten_fixture_cv_experience flattens an experience aggregate."""

    rows = flatten_fixture(cv_experience_fixture())

    assert set(rows) == {
        "cv_experience",
        "cv_experience_responsibility",
        "cv_stack_item",
        "cv_stack_item_experience_link",
    }
    assert rows["cv_experience"] == [
        {
            "id": fixture_id(0x30),
            "organization": "Acme Cloud GmbH",
            "job_title": "Senior Engineer",
            "start_date": cv_experience_fixture().start_date,
            "end_date": None,
            "description": "Platform work.",
        }
    ]
    assert rows["cv_experience_responsibility"] == [
        {
            "id": fixture_id(0x31),
            "experience_id": fixture_id(0x30),
            "description": "Ran the platform.",
        }
    ]
    assert rows["cv_stack_item"] == [{"id": fixture_id(0x33), "name": "Go"}]
    assert rows["cv_stack_item_experience_link"] == [
        {
            "id": fixture_id(0x32),
            "stack_item_id": fixture_id(0x33),
            "experience_id": fixture_id(0x30),
        }
    ]


def test_flatten_fixture_cv_skill_category() -> None:
    """test_flatten_fixture_cv_skill_category flattens a skill category."""

    rows = flatten_fixture(cv_skill_category_fixture(fixture_id(0x33)))

    assert rows == {
        "cv_skill_category": [{"id": fixture_id(0x40), "category": "Languages"}],
        "cv_stack_item_category_link": [
            {
                "id": fixture_id(0x41),
                "category_id": fixture_id(0x40),
                "stack_item_id": fixture_id(0x33),
            }
        ],
    }


def test_flatten_fixture_cv_education() -> None:
    """test_flatten_fixture_cv_education flattens an education aggregate."""

    education = CvEducationFixture.model_validate(
        {
            "id": fixture_id(0x70),
            "institution": "TU Munich",
            "certificate": "MSc",
            "start_date": "2014-10-01",
            "end_date": "2016-07-31",
        }
    )

    rows = flatten_fixture(education)

    assert rows == {
        "cv_education": [
            {
                "id": fixture_id(0x70),
                "institution": "TU Munich",
                "certificate": "MSc",
                "start_date": education.start_date,
                "end_date": education.end_date,
            }
        ]
    }


def test_flatten_fixture_subagent() -> None:
    """test_flatten_fixture_subagent flattens a subagent aggregate."""

    rows = flatten_fixture(
        SubagentFixture.model_validate(
            {
                "id": fixture_id(0x80),
                "name": "work-planner",
                "description": "Plans work.",
                "inputs": {"type": "object"},
                "outputs": None,
            }
        )
    )

    assert rows == {
        "subagent": [
            {
                "id": fixture_id(0x80),
                "name": "work-planner",
                "description": "Plans work.",
                "inputs": {"type": "object"},
                "outputs": None,
            }
        ]
    }


def test_flatten_fixture_project() -> None:
    """test_flatten_fixture_project flattens a project aggregate."""

    rows = flatten_fixture(
        ProjectFixture.model_validate(
            {
                "id": fixture_id(0x90),
                "name": "Personal Website",
                "description": "This website.",
                "primary_link": "https://example.com",
                "github_link": None,
                "display": True,
            }
        )
    )

    assert rows == {
        "project": [
            {
                "id": fixture_id(0x90),
                "name": "Personal Website",
                "description": "This website.",
                "primary_link": "https://example.com",
                "github_link": None,
                "display": True,
            }
        ]
    }


def test_flatten_fixture_api_key() -> None:
    """test_flatten_fixture_api_key flattens an API-key aggregate."""

    rows = flatten_fixture(api_key_fixture())

    assert rows == {
        "api_key": [
            {
                "id": fixture_id(0x50),
                "api_key": API_KEY_DIGEST,
                "description": "Acceptance suite key.",
                "issued_at": ISSUED_AT,
                "expires_at": None,
                "issued_for": "acceptance-suite",
            }
        ]
    }


def test_flatten_fixture_admin_audit_log() -> None:
    """test_flatten_fixture_admin_audit_log flattens an audit-log aggregate."""

    rows = flatten_fixture(audit_log_fixture(fixture_id(0x50)))

    assert rows == {
        "admin_audit_log": [
            {
                "id": fixture_id(0x60),
                "api_key_id": fixture_id(0x50),
                "endpoint": "/v1/admin/contacts",
                "method": "get",
                "status_code": 200,
                "payload": None,
                "response": {"count": 3},
            }
        ]
    }


def test_flatten_fixture_rejects_unknown_fixture() -> None:
    """test_flatten_fixture_rejects_unknown_fixture rejects a foreign object."""

    with pytest.raises(TypeError):
        flatten_fixture(object())


def test_flatten_fixtures_merges_every_domain(fixtures_root: Path) -> None:
    """test_flatten_fixtures_merges_every_domain merges all domain aggregates.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    rows = flatten_fixtures(complete_fixtures(fixtures_root))

    assert set(rows) == set(README_INSERT_ORDER) - {"project"}


def test_identical_shared_documents_collapse(fixtures_root: Path) -> None:
    """test_identical_shared_documents_collapse collapses an identical document.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    shared = document_payload(
        fixtures_root,
        fixture_id(0xA0),
        "documents/shared.md",
        b"# Shared\n",
    )
    specs = [
        AgentSpecFixture.from_fixture(
            {
                "id": fixture_id(0xA1 + index),
                "display_name": f"Spec {index}",
                "description": "A spec.",
                "documents": [
                    {
                        "id": fixture_id(0xB1 + index),
                        "document_type": "spec",
                        "document": dict(shared),
                    }
                ],
            },
            fixtures_root=fixtures_root,
        )
        for index in range(2)
    ]

    plan = build_seed_plan(specs)

    assert len(plan.rows["document"]) == 1
    assert plan.rows["document"][0]["id"] == fixture_id(0xA0)
    assert len(plan.rows["agent_spec_document_link"]) == 2


def test_conflicting_shared_documents_raise(fixtures_root: Path) -> None:
    """test_conflicting_shared_documents_raise rejects a conflicting document.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    specs = [
        AgentSpecFixture.from_fixture(
            {
                "id": fixture_id(0xA1 + index),
                "display_name": f"Spec {index}",
                "description": "A spec.",
                "documents": [
                    {
                        "id": fixture_id(0xC1),
                        "document_type": "spec",
                        "document": document_payload(
                            fixtures_root,
                            fixture_id(0xC0),
                            f"documents/spec-{index}.md",
                            b"# Shared\n",
                        ),
                    }
                ],
            },
            fixtures_root=fixtures_root,
        )
        for index in range(2)
    ]

    with pytest.raises(ConflictingFixtureRowError) as excinfo:
        build_seed_plan(specs)

    message = str(excinfo.value)
    assert "document" in message
    assert fixture_id(0xC0) in message
    assert "filename" in message


def test_distinct_documents_are_both_kept(fixtures_root: Path) -> None:
    """test_distinct_documents_are_both_kept keeps two distinct documents.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    specs = [
        AgentSpecFixture.from_fixture(
            {
                "id": fixture_id(0xA1 + index),
                "display_name": f"Spec {index}",
                "description": "A spec.",
                "documents": [
                    {
                        "id": fixture_id(0xD1 + index),
                        "document_type": "spec",
                        "document": document_payload(
                            fixtures_root,
                            fixture_id(0xD0 + index * 0x10),
                            f"documents/spec-{index}.md",
                            b"# Shared\n",
                        ),
                    }
                ],
            },
            fixtures_root=fixtures_root,
        )
        for index in range(2)
    ]

    plan = build_seed_plan(specs)

    assert [row["id"] for row in plan.rows["document"]] == [
        fixture_id(0xD0),
        fixture_id(0xD0 + 0x10),
    ]


def stack_item_experience(identifier: int, stack_item_name: str) -> CvExperienceFixture:
    """stack_item_experience builds an experience carrying one named stack item.

    The stack item always uses the same ID, so two experiences built by this
    helper collide on `base.cv_stack_item` and exercise de-duplication.

    Args:
        identifier (int): Seed distinguishing the experience and its link row.
        stack_item_name (str): Name of the embedded stack item.

    Returns:
        CvExperienceFixture: The validated experience aggregate.
    """

    return CvExperienceFixture.model_validate(
        {
            "id": fixture_id(0xE0 + identifier),
            "organization": "Acme Cloud GmbH",
            "job_title": "Engineer",
            "start_date": "2020-01-01",
            "description": "Work.",
            "stack_items": [
                {
                    "id": fixture_id(0xF0 + identifier),
                    "stack_item": {"id": fixture_id(0x33), "name": stack_item_name},
                }
            ],
        }
    )


def test_identical_shared_stack_items_collapse() -> None:
    """test_identical_shared_stack_items_collapse collapses an identical item."""

    plan = build_seed_plan(
        [stack_item_experience(0, "Go"), stack_item_experience(1, "Go")]
    )

    assert plan.rows["cv_stack_item"] == ({"id": fixture_id(0x33), "name": "Go"},)
    assert len(plan.rows["cv_stack_item_experience_link"]) == 2


def test_conflicting_shared_stack_items_raise() -> None:
    """test_conflicting_shared_stack_items_raise rejects a conflicting item."""

    with pytest.raises(ConflictingFixtureRowError) as excinfo:
        build_seed_plan(
            [stack_item_experience(0, "Go"), stack_item_experience(1, "Python")]
        )

    message = str(excinfo.value)
    assert "cv_stack_item" in message
    assert fixture_id(0x33) in message
    assert "name" in message


def test_distinct_stack_items_are_both_kept() -> None:
    """test_distinct_stack_items_are_both_kept keeps two distinct stack items."""

    second = CvExperienceFixture.model_validate(
        {
            "id": fixture_id(0xE9),
            "organization": "Beta Systems AG",
            "job_title": "Engineer",
            "start_date": "2018-01-01",
            "description": "Work.",
            "stack_items": [
                {
                    "id": fixture_id(0xF9),
                    "stack_item": {"id": fixture_id(0x34), "name": "Python"},
                }
            ],
        }
    )

    plan = build_seed_plan([stack_item_experience(0, "Go"), second])

    assert [row["id"] for row in plan.rows["cv_stack_item"]] == [
        fixture_id(0x33),
        fixture_id(0x34),
    ]


def test_unresolved_stack_item_reference_raises() -> None:
    """test_unresolved_stack_item_reference_raises rejects a dangling skill."""

    with pytest.raises(UnresolvedReferenceError) as excinfo:
        build_seed_plan([cv_skill_category_fixture(fixture_id(0xDEAD))])

    message = str(excinfo.value)
    assert "cv_stack_item_category_link" in message
    assert "stack_item_id" in message
    assert fixture_id(0xDEAD) in message


def test_unresolved_api_key_reference_raises() -> None:
    """test_unresolved_api_key_reference_raises rejects a dangling audit row."""

    with pytest.raises(UnresolvedReferenceError):
        build_seed_plan([audit_log_fixture(fixture_id(0xBEEF))])


def test_null_api_key_reference_resolves() -> None:
    """test_null_api_key_reference_resolves accepts an unauthenticated row."""

    plan = build_seed_plan([audit_log_fixture(None)])

    assert plan.rows["admin_audit_log"][0]["api_key_id"] is None


def test_truncate_set_holds_only_tables_receiving_rows(fixtures_root: Path) -> None:
    """test_truncate_set_holds_only_tables_receiving_rows pins the truncate set.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    plan = build_seed_plan(complete_fixtures(fixtures_root))

    assert set(plan.truncate_order) == set(plan.rows)
    assert all(len(plan.rows[table]) >= 1 for table in plan.truncate_order)
    assert "project" not in plan.truncate_order
    assert "project" not in plan.rows


def test_truncate_order_is_the_insert_order_reversed(fixtures_root: Path) -> None:
    """test_truncate_order_is_the_insert_order_reversed pins the truncate order.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    plan = build_seed_plan(complete_fixtures(fixtures_root))

    assert plan.truncate_order == tuple(reversed(plan.insert_order))


def test_insert_order_equals_the_readme_order() -> None:
    """test_insert_order_equals_the_readme_order pins the FK-safe order."""

    assert persistence.INSERT_ORDER == README_INSERT_ORDER


def test_insert_order_satisfies_every_foreign_key_pair() -> None:
    """test_insert_order_satisfies_every_foreign_key_pair checks each pair."""

    positions = {table: index for index, table in enumerate(README_INSERT_ORDER)}

    for parent, child in REQUIRED_ORDER_PAIRS:
        assert positions[parent] < positions[child]


def test_plan_insert_order_follows_the_readme_order(fixtures_root: Path) -> None:
    """test_plan_insert_order_follows_the_readme_order orders a partial plan.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    plan = build_seed_plan(complete_fixtures(fixtures_root))

    assert plan.insert_order == tuple(
        table for table in README_INSERT_ORDER if table != "project"
    )


def test_build_truncate_statements(fixtures_root: Path) -> None:
    """test_build_truncate_statements builds one cascading truncate per table.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    plan = build_seed_plan(complete_fixtures(fixtures_root))

    statements = build_truncate_statements(plan)

    assert len(statements) == len(plan.truncate_order)
    assert statements == tuple(
        f"TRUNCATE TABLE base.{table} CASCADE" for table in plan.truncate_order
    )


def test_build_insert_statements_are_parameterised(fixtures_root: Path) -> None:
    """test_build_insert_statements_are_parameterised keeps values out of SQL.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    plan = build_seed_plan(complete_fixtures(fixtures_root))

    statements = build_insert_statements(plan)

    literals = ("ada.lovelace@example.org", "Sample Post", API_KEY_DIGEST, "'")
    for statement in statements:
        assert statement.sql.startswith(f"INSERT INTO base.{statement.table} (")
        placeholders = statement.sql.count("%s")
        assert placeholders == len(statement.parameters[0])
        assert all(len(values) == placeholders for values in statement.parameters)
        for literal in literals:
            assert literal not in statement.sql


def test_build_insert_statements_follow_the_insert_order(fixtures_root: Path) -> None:
    """test_build_insert_statements_follow_the_insert_order orders statements.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    plan = build_seed_plan(complete_fixtures(fixtures_root))

    tables = [statement.table for statement in build_insert_statements(plan)]

    assert tables == sorted(tables, key=plan.insert_order.index)
    assert set(tables) == set(plan.insert_order)


def test_build_insert_statements_carry_document_content_as_bytes(
    fixtures_root: Path,
) -> None:
    """test_build_insert_statements_carry_document_content_as_bytes pins BYTEA.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    plan = build_seed_plan([article_fixture(fixtures_root)])

    statement = next(
        item for item in build_insert_statements(plan) if item.table == "document"
    )
    content_index = statement.sql[statement.sql.index("(") + 1 :].split(")")[0]
    columns = [column.strip() for column in content_index.split(",")]
    values = statement.parameters[0][columns.index("content")]

    assert isinstance(values, bytes)
    assert values == b"# Sample Post\n"


def test_build_insert_statements_group_optional_columns(fixtures_root: Path) -> None:
    """test_build_insert_statements_group_optional_columns omits absent columns.

    A comment without an explicit `created_at` must not pass NULL into a NOT NULL
    column: its statement omits the column so the server default applies.

    Args:
        fixtures_root (Path): Root the document sidecar file is written into.
    """

    plan = build_seed_plan([article_fixture(fixtures_root)])

    statements = [
        item
        for item in build_insert_statements(plan)
        if item.table == "article_comment"
    ]

    assert len(statements) == 2
    assert "created_at" in statements[0].sql
    assert "created_at" not in statements[1].sql


def test_build_insert_statements_wrap_json_values(fixtures_root: Path) -> None:
    """test_build_insert_statements_wrap_json_values adapts JSONB parameters.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    plan = build_seed_plan(complete_fixtures(fixtures_root))

    statement = next(
        item for item in build_insert_statements(plan) if item.table == "subagent"
    )

    assert not any(isinstance(value, dict) for value in statement.parameters[0])


def test_planning_functions_take_no_database_client() -> None:
    """test_planning_functions_take_no_database_client pins function purity."""

    functions = (
        flatten_fixture,
        flatten_fixtures,
        build_seed_plan,
        build_truncate_statements,
        build_insert_statements,
    )

    for function in functions:
        parameters = inspect.signature(function).parameters
        assert not {"connection", "conn", "cursor"} & set(parameters)


class FailingCursor:
    """FailingCursor wraps a fake cursor and fails on one table's insert.

    The wrapper stands in for a server rejecting a statement mid-run: every call
    is forwarded to the recording cursor until the insert into the nominated
    table is reached, at which point it raises instead of recording.
    """

    def __init__(self, cursor: Any, failing_table: str) -> None:
        """__init__ wraps a recording cursor.

        Args:
            cursor (Any): The recording fake cursor being wrapped.
            failing_table (str): Table whose insert raises.

        Returns:
            None
        """

        self.cursor = cursor
        self.failing_table = failing_table

    def execute(self, sql: Any, params: Any = None) -> Any:
        """execute forwards a statement to the recording cursor.

        Args:
            sql (Any): The statement.
            params (Any): The statement parameters.

        Returns:
            Any: Whatever the recording cursor returns.
        """

        return self.cursor.execute(sql, params)

    def executemany(self, sql: Any, params_seq: Any = None) -> Any:
        """executemany forwards a statement unless it targets the failing table.

        Args:
            sql (Any): The statement.
            params_seq (Any): The sequence of parameter tuples.

        Returns:
            Any: Whatever the recording cursor returns.

        Raises:
            RuntimeError: If the statement inserts into the failing table.
        """

        if f"INTO base.{self.failing_table} " in str(sql):
            raise RuntimeError("insert rejected by the server")

        return self.cursor.executemany(sql, params_seq)

    def __enter__(self) -> "FailingCursor":
        """__enter__ enters the cursor context.

        Returns:
            FailingCursor: This cursor.
        """

        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        """__exit__ closes the wrapped cursor.

        Args:
            exc_type (Any): The raised exception type.
            exc (Any): The raised exception.
            traceback (Any): The exception traceback.

        Returns:
            None
        """

        self.cursor.close()


class FailingConnection:
    """FailingConnection is a recording connection whose inserts fail once."""

    def __init__(self, connection: Any, failing_table: str) -> None:
        """__init__ wraps a recording fake connection.

        Args:
            connection (Any): The recording fake connection being wrapped.
            failing_table (str): Table whose insert raises.

        Returns:
            None
        """

        self.connection = connection
        self.failing_table = failing_table

    def cursor(self, *args: Any, **kwargs: Any) -> FailingCursor:
        """cursor returns a failing wrapper around a recording cursor.

        Args:
            *args (Any): Positional arguments forwarded to the connection.
            **kwargs (Any): Keyword arguments forwarded to the connection.

        Returns:
            FailingCursor: The wrapped cursor.
        """

        return FailingCursor(
            self.connection.cursor(*args, **kwargs), self.failing_table
        )

    def transaction(self, *args: Any, **kwargs: Any) -> Any:
        """transaction forwards to the recording transaction context manager.

        Args:
            *args (Any): Positional arguments forwarded to the connection.
            **kwargs (Any): Keyword arguments forwarded to the connection.

        Returns:
            Any: The recording transaction context manager.
        """

        return self.connection.transaction(*args, **kwargs)

    def commit(self) -> None:
        """commit forwards the commit to the recorder.

        Returns:
            None
        """

        self.connection.commit()

    def rollback(self) -> None:
        """rollback forwards the rollback to the recorder.

        Returns:
            None
        """

        self.connection.rollback()


def seeded_plan(fixtures_root: Path) -> Any:
    """seeded_plan builds the plan every executor test runs.

    Args:
        fixtures_root (Path): Root the document sidecar files are written into.

    Returns:
        Any: The seed plan of the complete fixture set.
    """

    return build_seed_plan(complete_fixtures(fixtures_root))


def executed_tables(statements: list[str], prefix: str) -> list[str]:
    """executed_tables extracts the tables of the statements sharing a prefix.

    Args:
        statements (list[str]): The recorded statements, in order.
        prefix (str): The statement prefix identifying the statement kind.

    Returns:
        list[str]: The table of every matching statement, in execution order.
    """

    return [
        statement[len(prefix) :].split(" ")[0].split("(")[0].strip()
        for statement in statements
        if statement.startswith(prefix)
    ]


def comparable(parameters: Any) -> list[tuple[Any, ...]]:
    """comparable normalises parameter tuples for equality assertions.

    `Jsonb` adapters compare by identity, so two independently built statements
    carrying the same JSON payload would otherwise never match. Each adapter is
    replaced by the object it wraps.

    Args:
        parameters (Any): The parameter tuples of one statement.

    Returns:
        list[tuple[Any, ...]]: The tuples with every adapter unwrapped.
    """

    return [
        tuple(value.obj if isinstance(value, Jsonb) else value for value in values)
        for values in parameters
    ]


def test_execute_seed_plan_runs_every_statement_in_one_transaction(
    fake_connection: Any,
    call_recorder: Any,
    fixtures_root: Path,
) -> None:
    """test_execute_seed_plan_runs_every_statement_in_one_transaction pins REQ-2.5.

    Args:
        fake_connection (Any): The recording fake connection.
        call_recorder (Any): The recorder holding the call sequence.
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    execute_seed_plan(fake_connection, seeded_plan(fixtures_root))

    names = call_recorder.names
    assert names.count(conftest.TRANSACTION_ENTER) == 1
    assert names.count(conftest.TRANSACTION_EXIT) == 1

    opened = names.index(conftest.TRANSACTION_ENTER)
    closed = names.index(conftest.TRANSACTION_EXIT)
    statement_positions = [
        index
        for index, name in enumerate(names)
        if name in (conftest.EXECUTE, conftest.EXECUTEMANY)
    ]

    assert statement_positions
    assert all(opened < index < closed for index in statement_positions)


def test_execute_seed_plan_commits_exactly_once(
    fake_connection: Any,
    call_recorder: Any,
    fixtures_root: Path,
) -> None:
    """test_execute_seed_plan_commits_exactly_once pins the single commit path.

    The count is a property of the fake, not of psycopg: `FakeTransaction`
    performs no implicit commit on exit, so the one commit recorded here is the
    explicit `connection.commit()` after the block. Against a real
    `psycopg.Connection` the block itself commits and that explicit call is a
    no-op on an idle connection - either way the plan is written by exactly one
    unit of work, which is what this test pins.

    Args:
        fake_connection (Any): The recording fake connection.
        call_recorder (Any): The recorder holding the call sequence.
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    execute_seed_plan(fake_connection, seeded_plan(fixtures_root))

    names = call_recorder.names
    assert call_recorder.commit_count == 1
    assert call_recorder.rollback_count == 0
    assert names.index(conftest.COMMIT) > names.index(conftest.TRANSACTION_EXIT)


def test_execute_seed_plan_truncates_each_table_exactly_once(
    fake_connection: Any,
    call_recorder: Any,
    fixtures_root: Path,
) -> None:
    """test_execute_seed_plan_truncates_each_table_exactly_once pins truncation.

    Args:
        fake_connection (Any): The recording fake connection.
        call_recorder (Any): The recorder holding the call sequence.
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    plan = seeded_plan(fixtures_root)

    execute_seed_plan(fake_connection, plan)

    truncated = executed_tables(call_recorder.statements, "TRUNCATE TABLE base.")
    assert truncated == list(plan.truncate_order)
    assert len(truncated) == len(set(truncated))
    assert "project" not in truncated


def test_execute_seed_plan_truncates_before_inserting(
    fake_connection: Any,
    call_recorder: Any,
    fixtures_root: Path,
) -> None:
    """test_execute_seed_plan_truncates_before_inserting orders the two phases.

    Args:
        fake_connection (Any): The recording fake connection.
        call_recorder (Any): The recorder holding the call sequence.
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    plan = seeded_plan(fixtures_root)

    execute_seed_plan(fake_connection, plan)

    statements = call_recorder.statements
    for table in plan.truncate_order:
        truncated = statements.index(f"TRUNCATE TABLE base.{table} CASCADE")
        inserted = next(
            index
            for index, statement in enumerate(statements)
            if statement.startswith(f"INSERT INTO base.{table} (")
        )
        assert truncated < inserted


def test_execute_seed_plan_inserts_in_the_fk_safe_order(
    fake_connection: Any,
    call_recorder: Any,
    fixtures_root: Path,
) -> None:
    """test_execute_seed_plan_inserts_in_the_fk_safe_order pins the insert order.

    Args:
        fake_connection (Any): The recording fake connection.
        call_recorder (Any): The recorder holding the call sequence.
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    plan = seeded_plan(fixtures_root)

    execute_seed_plan(fake_connection, plan)

    inserted = executed_tables(call_recorder.statements, "INSERT INTO base.")
    assert set(inserted) == set(plan.insert_order)
    assert inserted == sorted(inserted, key=plan.insert_order.index)


def test_execute_seed_plan_runs_every_built_statement(
    fake_connection: Any,
    call_recorder: Any,
    fixtures_root: Path,
) -> None:
    """test_execute_seed_plan_runs_every_built_statement pins the parameters.

    A table may contribute more than one insert - the grouped optional columns
    of `base.article_comment` - so every built statement is matched in order.

    Args:
        fake_connection (Any): The recording fake connection.
        call_recorder (Any): The recorder holding the call sequence.
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    plan = seeded_plan(fixtures_root)
    inserts = build_insert_statements(plan)

    total = execute_seed_plan(fake_connection, plan)

    executed = [
        call
        for call in call_recorder.executed
        if call.sql.startswith("INSERT INTO base.")
    ]
    assert [call.sql for call in executed] == [insert.sql for insert in inserts]
    assert [comparable(call.params) for call in executed] == [
        comparable(insert.parameters) for insert in inserts
    ]
    assert total == sum(len(insert.parameters) for insert in inserts)


def test_execute_seed_plan_does_not_commit_on_failure(
    fake_connection: Any,
    call_recorder: Any,
    fixtures_root: Path,
) -> None:
    """test_execute_seed_plan_does_not_commit_on_failure pins atomicity (AC-7).

    Args:
        fake_connection (Any): The recording fake connection.
        call_recorder (Any): The recorder holding the call sequence.
        fixtures_root (Path): Root the document sidecar files are written into.
    """

    connection = FailingConnection(fake_connection, failing_table="article")

    with pytest.raises(RuntimeError):
        execute_seed_plan(connection, seeded_plan(fixtures_root))

    names = call_recorder.names
    assert call_recorder.commit_count == 0
    assert names.count(conftest.TRANSACTION_ENTER) == 1
    assert names.count(conftest.TRANSACTION_EXIT) == 1
    assert not any(
        statement.startswith("INSERT INTO base.topic_article_link")
        for statement in call_recorder.statements
    )


def test_execute_seed_plan_takes_an_open_connection(fixtures_root: Path) -> None:
    """test_execute_seed_plan_takes_an_open_connection pins dependency injection.

    Args:
        fixtures_root (Path): Unused; keeps the signature uniform.
    """

    parameters = list(inspect.signature(execute_seed_plan).parameters)

    assert parameters[0] == "connection"

    source = inspect.getsource(persistence)
    assert "psycopg.connect" not in source
    assert "src.fixtures" not in source


def test_persistence_module_has_a_single_commit_path() -> None:
    """test_persistence_module_has_a_single_commit_path pins REQ-2.5 atomicity."""

    source = inspect.getsource(persistence)

    assert source.count(".commit()") == 1
    assert "autocommit=True" not in source
    assert "autocommit =" not in source
    assert ".autocommit" not in source
    assert "rollback" not in source
