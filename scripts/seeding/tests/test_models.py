"""Unit tests for the seeding component fixture models.

The suite pins binding decision F-1 (`docs/specs/SPEC-001-REVIEW.md` §6a, restated
as the fixture contract in `scripts/seeding/README.md` §5.1): a document fixture's
`content` field is a path relative to the fixtures root, the seeder reads that file
as bytes, and `size` is derived from the byte length and never fixture-supplied.

Every containment, existence and emptiness rule is asserted here rather than left
to the database, because each is a validation error that must be raised *before*
any database interaction (RISK-009).

The suite also pins the domain-aggregate models (REQ-2.4): one model per fixture
file listed in the catalogue of `scripts/seeding/README.md` §4, whose fields match
the columns declared by
`alembic/migrations/versions/0001_initial_base_schema.py` in name, type,
nullability and default.

NO-SERVER RULE: every test drives the models against a synthetic `tmp_path`
fixture tree only. No PostgreSQL server is started or contacted, so the suite
passes with no `postgres` executable present.
"""

from __future__ import annotations

import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

SEEDING_ROOT: Path = Path(__file__).resolve().parent.parent

if str(SEEDING_ROOT) not in sys.path:
    sys.path.insert(0, str(SEEDING_ROOT))

from src.models import (  # noqa: E402
    DOMAIN_FIXTURE_MODELS,
    FIXTURES_ROOT_CONTEXT_KEY,
    AdminAuditLogFixture,
    AgentSpecFixture,
    ApiKeyFixture,
    ArticleFixture,
    ContactFixture,
    CvEducationFixture,
    CvExperienceFixture,
    CvSkillCategoryFixture,
    DocumentFixture,
    DocumentType,
    FixtureModel,
    HttpMethod,
    IdentifiedFixtureModel,
    ProjectFixture,
    SubagentFixture,
)

DOCUMENT_ID: str = "0192f3a45b6c7d8e9f0a1b2c3d4e5f60"
RELATIVE_PATH: str = "documents/blog/sample-post.md"
FILENAME: str = "sample-post.md"

CONTENT: bytes = b"# Sample Post\n\nRepresentative markdown content.\n"

# Bytes that are not valid UTF-8: reading the sidecar in text mode, or decoding
# and re-encoding it anywhere along the path, would raise or alter these.
BINARY_CONTENT: bytes = b"\xff\xfe\x00binary\x80payload\n"


def write_sidecar(
    fixtures_root: Path,
    relative_path: str,
    content: bytes,
) -> Path:
    """write_sidecar writes a sidecar content file into a fixture tree.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.
        relative_path (str): Path of the sidecar file relative to the root.
        content (bytes): Bytes to write to the file.

    Returns:
        Path: The absolute path of the written file.
    """

    path = fixtures_root / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


def document_payload(**overrides: object) -> dict[str, object]:
    """document_payload builds a valid document fixture payload.

    Args:
        **overrides (object): Keys overriding or extending the valid payload.

    Returns:
        dict[str, object]: The fixture payload to validate.
    """

    payload: dict[str, object] = {
        "id": DOCUMENT_ID,
        "filename": FILENAME,
        "restricted": False,
        "content": RELATIVE_PATH,
    }
    payload.update(overrides)
    return payload


def test_from_fixture_reads_content_and_derives_size(fixtures_root: Path) -> None:
    """test_from_fixture_reads_content_and_derives_size pins the happy path.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_sidecar(fixtures_root, RELATIVE_PATH, CONTENT)

    document = DocumentFixture.from_fixture(document_payload(), fixtures_root)

    assert document.id == DOCUMENT_ID
    assert document.filename == FILENAME
    assert document.restricted is False
    assert document.content == CONTENT
    assert document.size == len(CONTENT)


def test_from_fixture_reads_content_in_binary_mode(fixtures_root: Path) -> None:
    """test_from_fixture_reads_content_in_binary_mode pins byte fidelity.

    Content that is not valid UTF-8 must survive validation unchanged, proving no
    decode/encode round trip happens anywhere on the path.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_sidecar(fixtures_root, RELATIVE_PATH, BINARY_CONTENT)

    document = DocumentFixture.from_fixture(document_payload(), fixtures_root)

    assert document.content == BINARY_CONTENT
    assert document.size == len(BINARY_CONTENT)


def test_from_fixture_defaults_restricted_to_true(fixtures_root: Path) -> None:
    """test_from_fixture_defaults_restricted_to_true pins the schema default.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_sidecar(fixtures_root, RELATIVE_PATH, CONTENT)
    payload = document_payload()
    del payload["restricted"]

    document = DocumentFixture.from_fixture(payload, fixtures_root)

    assert document.restricted is True


def test_from_fixture_accepts_context_supplied_root(fixtures_root: Path) -> None:
    """test_from_fixture_accepts_context_supplied_root pins the context key.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_sidecar(fixtures_root, RELATIVE_PATH, CONTENT)

    document = DocumentFixture.model_validate(
        document_payload(),
        context={FIXTURES_ROOT_CONTEXT_KEY: fixtures_root},
    )

    assert document.content == CONTENT


def test_from_fixture_rejects_traversal_path(fixtures_root: Path) -> None:
    """test_from_fixture_rejects_traversal_path pins the `..` containment check.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    outside = fixtures_root.parent / "outside.md"
    outside.write_bytes(CONTENT)

    with pytest.raises(ValidationError, match="outside"):
        DocumentFixture.from_fixture(
            document_payload(content="../outside.md"),
            fixtures_root,
        )


def test_from_fixture_rejects_nested_traversal_path(fixtures_root: Path) -> None:
    """test_from_fixture_rejects_nested_traversal_path pins mid-path `..`.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    outside = fixtures_root.parent / "outside.md"
    outside.write_bytes(CONTENT)

    with pytest.raises(ValidationError, match="outside"):
        DocumentFixture.from_fixture(
            document_payload(content="documents/blog/../../../outside.md"),
            fixtures_root,
        )


def test_from_fixture_rejects_symlink_escape(fixtures_root: Path) -> None:
    """test_from_fixture_rejects_symlink_escape pins symlink containment.

    The path contains no `..` segment: only comparing fully resolved absolute
    paths catches it.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    outside = fixtures_root.parent / "outside.md"
    outside.write_bytes(CONTENT)
    link = fixtures_root / "documents" / "escape.md"
    link.parent.mkdir(parents=True, exist_ok=True)
    link.symlink_to(outside)

    with pytest.raises(ValidationError, match="outside"):
        DocumentFixture.from_fixture(
            document_payload(content="documents/escape.md"),
            fixtures_root,
        )


def test_from_fixture_rejects_absolute_path(fixtures_root: Path) -> None:
    """test_from_fixture_rejects_absolute_path pins the absolute-path rejection.

    The target is a legitimate file *inside* the root, so only the absoluteness
    of the supplied path can be what rejects it.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    absolute = write_sidecar(fixtures_root, RELATIVE_PATH, CONTENT)

    with pytest.raises(ValidationError, match="absolute"):
        DocumentFixture.from_fixture(
            document_payload(content=str(absolute)),
            fixtures_root,
        )


def test_from_fixture_rejects_missing_file(fixtures_root: Path) -> None:
    """test_from_fixture_rejects_missing_file pins the existence check.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    with pytest.raises(ValidationError, match="does not exist"):
        DocumentFixture.from_fixture(document_payload(), fixtures_root)


def test_from_fixture_rejects_directory(fixtures_root: Path) -> None:
    """test_from_fixture_rejects_directory pins rejection of a non-file path.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    (fixtures_root / "documents" / "blog").mkdir(parents=True)

    with pytest.raises(ValidationError, match="does not exist"):
        DocumentFixture.from_fixture(
            document_payload(content="documents/blog"),
            fixtures_root,
        )


def test_from_fixture_rejects_empty_file(fixtures_root: Path) -> None:
    """test_from_fixture_rejects_empty_file pins the AC-10 non-empty rule.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_sidecar(fixtures_root, RELATIVE_PATH, b"")

    with pytest.raises(ValidationError, match="empty"):
        DocumentFixture.from_fixture(document_payload(), fixtures_root)


def test_from_fixture_rejects_fixture_supplied_size(fixtures_root: Path) -> None:
    """test_from_fixture_rejects_fixture_supplied_size pins the derived size rule.

    The supplied value is the *correct* byte length, so agreement with the file
    is not what makes it acceptable: the field is derived, full stop.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_sidecar(fixtures_root, RELATIVE_PATH, CONTENT)

    with pytest.raises(ValidationError, match="derived"):
        DocumentFixture.from_fixture(
            document_payload(size=len(CONTENT)),
            fixtures_root,
        )


def test_from_fixture_rejects_unknown_field(fixtures_root: Path) -> None:
    """test_from_fixture_rejects_unknown_field pins `extra="forbid"`.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_sidecar(fixtures_root, RELATIVE_PATH, CONTENT)

    with pytest.raises(ValidationError, match="extra_forbidden"):
        DocumentFixture.from_fixture(
            document_payload(document_type="spec"),
            fixtures_root,
        )


def test_from_fixture_rejects_inline_content(fixtures_root: Path) -> None:
    """test_from_fixture_rejects_inline_content pins the sidecar-only contract.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    with pytest.raises(ValidationError, match="path"):
        DocumentFixture.from_fixture(
            document_payload(content=CONTENT),
            fixtures_root,
        )


def test_from_fixture_rejects_missing_content(fixtures_root: Path) -> None:
    """test_from_fixture_rejects_missing_content pins content as required.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    payload = document_payload()
    del payload["content"]

    with pytest.raises(ValidationError, match="content"):
        DocumentFixture.from_fixture(payload, fixtures_root)


def test_model_validate_without_fixtures_root_is_rejected(
    fixtures_root: Path,
) -> None:
    """test_model_validate_without_fixtures_root_is_rejected pins the injection.

    Validating without a fixtures root must fail loudly rather than silently
    falling back to the process working directory.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_sidecar(fixtures_root, RELATIVE_PATH, CONTENT)

    with pytest.raises(ValidationError, match="fixtures root"):
        DocumentFixture.model_validate(document_payload())


@pytest.mark.parametrize(
    "identifier",
    [
        pytest.param("", id="empty"),
        pytest.param("0192f3a45b6c7d8e9f0a1b2c3d4e5f6", id="too_short"),
        pytest.param("0192f3a45b6c7d8e9f0a1b2c3d4e5f601", id="too_long"),
        pytest.param("0192f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f60", id="hyphenated"),
        pytest.param("0192F3A45B6C7D8E9F0A1B2C3D4E5F60", id="upper_case"),
        pytest.param("0192f3a45b6c7d8e9f0a1b2c3d4e5fzz", id="non_hex"),
    ],
)
def test_from_fixture_rejects_invalid_id(
    fixtures_root: Path,
    identifier: str,
) -> None:
    """test_from_fixture_rejects_invalid_id pins the UUIDv7 hex ID format.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.
        identifier (str): The malformed identifier under test.

    Returns:
        None
    """

    write_sidecar(fixtures_root, RELATIVE_PATH, CONTENT)

    with pytest.raises(ValidationError, match="id"):
        DocumentFixture.from_fixture(
            document_payload(id=identifier),
            fixtures_root,
        )


def test_from_fixture_rejects_missing_id(fixtures_root: Path) -> None:
    """test_from_fixture_rejects_missing_id pins `id` as required (REQ-2.3).

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_sidecar(fixtures_root, RELATIVE_PATH, CONTENT)
    payload = document_payload()
    del payload["id"]

    with pytest.raises(ValidationError, match="id"):
        DocumentFixture.from_fixture(payload, fixtures_root)


def test_from_fixture_rejects_empty_filename(fixtures_root: Path) -> None:
    """test_from_fixture_rejects_empty_filename pins the filename constraint.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_sidecar(fixtures_root, RELATIVE_PATH, CONTENT)

    with pytest.raises(ValidationError, match="filename"):
        DocumentFixture.from_fixture(
            document_payload(filename=""),
            fixtures_root,
        )


def test_base_models_forbid_extra_fields() -> None:
    """test_base_models_forbid_extra_fields pins the shared base configuration.

    Returns:
        None
    """

    assert FixtureModel.model_config["extra"] == "forbid"
    assert issubclass(IdentifiedFixtureModel, FixtureModel)
    assert issubclass(DocumentFixture, IdentifiedFixtureModel)

    with pytest.raises(ValidationError, match="extra_forbidden"):
        IdentifiedFixtureModel.model_validate({"id": DOCUMENT_ID, "unknown": 1})


TIMESTAMP: str = "2024-05-01T09:30:00Z"
NAIVE_TIMESTAMP: str = "2024-05-01T09:30:00"

SPEC_RELATIVE_PATH: str = "documents/specs/sample-spec.md"
SPEC_FILENAME: str = "sample-spec.md"

API_KEY_DIGEST: str = "75952bd375671a21940e6f19fd474070e93f7b4abd3e2f7a0c2a161b4d296e31"


def fixture_id(seed: int) -> str:
    """fixture_id builds a distinct, well-formed fixture identifier.

    Args:
        seed (int): Value rendered as the identifier's hex payload.

    Returns:
        str: A 32-character lower-case hex string.
    """

    return f"{seed:032x}"


def write_document_sidecars(fixtures_root: Path) -> None:
    """write_document_sidecars writes every sidecar the aggregates reference.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_sidecar(fixtures_root, RELATIVE_PATH, CONTENT)
    write_sidecar(fixtures_root, SPEC_RELATIVE_PATH, CONTENT)


def override(payload: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    """override applies keyword overrides to a freshly built payload.

    Args:
        payload (dict[str, Any]): The valid payload to amend.
        overrides (dict[str, Any]): Keys overriding or extending the payload.

    Returns:
        dict[str, Any]: The amended payload.
    """

    payload.update(overrides)
    return payload


def contact_payload(**overrides: Any) -> dict[str, Any]:
    """contact_payload builds a valid `contacts.json` aggregate payload.

    Args:
        **overrides (Any): Keys overriding or extending the valid payload.

    Returns:
        dict[str, Any]: The fixture payload to validate.
    """

    return override(
        {
            "id": fixture_id(1),
            "name": "Ada Lovelace",
            "email": "ada.lovelace@example.org",
            "organization": "Analytical Engines Ltd",
            "messages": [
                {
                    "id": fixture_id(2),
                    "content": "Interested in your work.",
                    "read": True,
                    "submitted_at": TIMESTAMP,
                },
                {
                    "id": fixture_id(3),
                    "content": "Following up on the above.",
                    "submitted_at": "2024-05-02T09:30:00Z",
                },
            ],
        },
        overrides,
    )


def article_payload(**overrides: Any) -> dict[str, Any]:
    """article_payload builds a valid `blog.json` aggregate payload.

    Args:
        **overrides (Any): Keys overriding or extending the valid payload.

    Returns:
        dict[str, Any]: The fixture payload to validate.
    """

    return override(
        {
            "id": fixture_id(10),
            "author": "Pascal Sauerborn",
            "display": True,
            "title": "Sample Post",
            "description": "A representative blog article.",
            "authored_at": TIMESTAMP,
            "document": {
                "id": fixture_id(11),
                "filename": FILENAME,
                "restricted": False,
                "content": RELATIVE_PATH,
            },
            "topics": [
                {
                    "id": fixture_id(16),
                    "topic": {"id": fixture_id(12), "name": "golang"},
                },
                {
                    "id": fixture_id(17),
                    "topic": {
                        "id": fixture_id(13),
                        "name": "postgres",
                        "description": "The database.",
                    },
                },
            ],
            "comments": [
                {
                    "id": fixture_id(14),
                    "comment": "Great post.",
                    "author": "John Doe",
                    "created_at": TIMESTAMP,
                },
                {"id": fixture_id(15), "comment": "Anonymous praise."},
            ],
        },
        overrides,
    )


def agent_spec_payload(**overrides: Any) -> dict[str, Any]:
    """agent_spec_payload builds a valid `agent_specs.json` aggregate payload.

    Args:
        **overrides (Any): Keys overriding or extending the valid payload.

    Returns:
        dict[str, Any]: The fixture payload to validate.
    """

    return override(
        {
            "id": fixture_id(20),
            "display_name": "Sample Spec",
            "description": "A representative spec.",
            "display": True,
            "documents": [
                {
                    "id": fixture_id(21),
                    "document_type": "spec",
                    "document": {
                        "id": fixture_id(22),
                        "filename": SPEC_FILENAME,
                        "restricted": False,
                        "content": SPEC_RELATIVE_PATH,
                    },
                }
            ],
        },
        overrides,
    )


def cv_experience_payload(**overrides: Any) -> dict[str, Any]:
    """cv_experience_payload builds a valid `cv_experience.json` payload.

    Args:
        **overrides (Any): Keys overriding or extending the valid payload.

    Returns:
        dict[str, Any]: The fixture payload to validate.
    """

    return override(
        {
            "id": fixture_id(30),
            "organization": "Acme Cloud GmbH",
            "job_title": "Senior Engineer",
            "start_date": "2022-03-01",
            "end_date": None,
            "description": "Platform engineering.",
            "responsibilities": [
                {"id": fixture_id(31), "description": "Ran the platform."}
            ],
            "stack_items": [
                {
                    "id": fixture_id(32),
                    "stack_item": {"id": fixture_id(33), "name": "Go"},
                }
            ],
        },
        overrides,
    )


def cv_skill_category_payload(**overrides: Any) -> dict[str, Any]:
    """cv_skill_category_payload builds a valid `cv_skills.json` payload.

    Args:
        **overrides (Any): Keys overriding or extending the valid payload.

    Returns:
        dict[str, Any]: The fixture payload to validate.
    """

    return override(
        {
            "id": fixture_id(40),
            "category": "Languages",
            "stack_items": [
                {"id": fixture_id(41), "stack_item_id": fixture_id(33)},
                {"id": fixture_id(42), "stack_item_id": fixture_id(34)},
            ],
        },
        overrides,
    )


def cv_education_payload(**overrides: Any) -> dict[str, Any]:
    """cv_education_payload builds a valid `cv_education.json` payload.

    Args:
        **overrides (Any): Keys overriding or extending the valid payload.

    Returns:
        dict[str, Any]: The fixture payload to validate.
    """

    return override(
        {
            "id": fixture_id(50),
            "institution": "TU Munich",
            "certificate": "MSc",
            "start_date": "2014-10-01",
            "end_date": "2016-07-31",
        },
        overrides,
    )


def subagent_payload(**overrides: Any) -> dict[str, Any]:
    """subagent_payload builds a valid `subagents.json` payload.

    Args:
        **overrides (Any): Keys overriding or extending the valid payload.

    Returns:
        dict[str, Any]: The fixture payload to validate.
    """

    return override(
        {
            "id": fixture_id(60),
            "name": "work-planner",
            "description": "Plans the work.",
            "inputs": {"type": "object"},
            "outputs": {"type": "object"},
        },
        overrides,
    )


def project_payload(**overrides: Any) -> dict[str, Any]:
    """project_payload builds a valid `projects.json` payload.

    Args:
        **overrides (Any): Keys overriding or extending the valid payload.

    Returns:
        dict[str, Any]: The fixture payload to validate.
    """

    return override(
        {
            "id": fixture_id(70),
            "name": "Personal Website",
            "description": "This website.",
            "primary_link": "https://example.com",
            "github_link": "https://github.com/example/personal-website",
            "display": True,
        },
        overrides,
    )


def api_key_payload(**overrides: Any) -> dict[str, Any]:
    """api_key_payload builds a valid `api_keys.json` payload.

    Args:
        **overrides (Any): Keys overriding or extending the valid payload.

    Returns:
        dict[str, Any]: The fixture payload to validate.
    """

    return override(
        {
            "id": fixture_id(80),
            "api_key": API_KEY_DIGEST,
            "description": "Acceptance suite key.",
            "issued_at": TIMESTAMP,
            "expires_at": None,
            "issued_for": "acceptance-suite",
        },
        overrides,
    )


def admin_audit_log_payload(**overrides: Any) -> dict[str, Any]:
    """admin_audit_log_payload builds a valid `admin_audit_log.json` payload.

    Args:
        **overrides (Any): Keys overriding or extending the valid payload.

    Returns:
        dict[str, Any]: The fixture payload to validate.
    """

    return override(
        {
            "id": fixture_id(90),
            "api_key_id": fixture_id(80),
            "endpoint": "/v1/admin/contacts",
            "method": "get",
            "status_code": 200,
            "payload": None,
            "response": {"contacts": []},
        },
        overrides,
    )


# Every domain aggregate, paired with the builder of a valid payload for it. The
# generic rejection tests below run against all ten.
AGGREGATE_CASES: list[Any] = [
    pytest.param(ContactFixture, contact_payload, id="contacts"),
    pytest.param(ArticleFixture, article_payload, id="blog"),
    pytest.param(AgentSpecFixture, agent_spec_payload, id="agent_specs"),
    pytest.param(CvExperienceFixture, cv_experience_payload, id="cv_experience"),
    pytest.param(CvSkillCategoryFixture, cv_skill_category_payload, id="cv_skills"),
    pytest.param(CvEducationFixture, cv_education_payload, id="cv_education"),
    pytest.param(SubagentFixture, subagent_payload, id="subagents"),
    pytest.param(ProjectFixture, project_payload, id="projects"),
    pytest.param(ApiKeyFixture, api_key_payload, id="api_keys"),
    pytest.param(AdminAuditLogFixture, admin_audit_log_payload, id="admin_audit_log"),
]

# Aggregates carrying nested records, with the path to a nested `id` field.
NESTED_ID_CASES: list[Any] = [
    pytest.param(ContactFixture, contact_payload, "messages", id="message"),
    pytest.param(ArticleFixture, article_payload, "topics", id="topic_link"),
    pytest.param(ArticleFixture, article_payload, "comments", id="comment"),
    pytest.param(AgentSpecFixture, agent_spec_payload, "documents", id="spec_document"),
    pytest.param(
        CvExperienceFixture,
        cv_experience_payload,
        "responsibilities",
        id="responsibility",
    ),
    pytest.param(
        CvExperienceFixture,
        cv_experience_payload,
        "stack_items",
        id="stack_item_link",
    ),
    pytest.param(
        CvSkillCategoryFixture,
        cv_skill_category_payload,
        "stack_items",
        id="category_link",
    ),
]


def test_domain_fixture_models_cover_every_catalogue_file() -> None:
    """test_domain_fixture_models_cover_every_catalogue_file pins the catalogue.

    Exactly one aggregate model exists per fixture file of
    `scripts/seeding/README.md` §4, and no two files share a model.

    Returns:
        None
    """

    assert set(DOMAIN_FIXTURE_MODELS) == {
        "contacts.json",
        "blog.json",
        "agent_specs.json",
        "cv_experience.json",
        "cv_skills.json",
        "cv_education.json",
        "subagents.json",
        "projects.json",
        "api_keys.json",
        "admin_audit_log.json",
    }
    assert len(set(DOMAIN_FIXTURE_MODELS.values())) == len(DOMAIN_FIXTURE_MODELS)
    assert all(
        issubclass(model, IdentifiedFixtureModel)
        for model in DOMAIN_FIXTURE_MODELS.values()
    )


def test_contact_fixture_accepts_valid_payload() -> None:
    """test_contact_fixture_accepts_valid_payload pins the contacts aggregate.

    Returns:
        None
    """

    contact = ContactFixture.model_validate(contact_payload())

    assert contact.email == "ada.lovelace@example.org"
    assert contact.organization == "Analytical Engines Ltd"
    assert [message.id for message in contact.messages] == [
        fixture_id(2),
        fixture_id(3),
    ]
    assert contact.messages[0].read is True
    assert contact.messages[0].submitted_at == datetime(
        2024, 5, 1, 9, 30, tzinfo=timezone.utc
    )


def test_contact_fixture_applies_column_defaults() -> None:
    """test_contact_fixture_applies_column_defaults pins the schema defaults.

    `organization` is nullable and `message.read` defaults to false.

    Returns:
        None
    """

    payload = contact_payload(
        organization=None,
        messages=[
            {
                "id": fixture_id(2),
                "content": "Interested in your work.",
                "submitted_at": TIMESTAMP,
            }
        ],
    )

    contact = ContactFixture.model_validate(payload)

    assert contact.organization is None
    assert contact.messages[0].read is False


def test_article_fixture_accepts_valid_payload(fixtures_root: Path) -> None:
    """test_article_fixture_accepts_valid_payload pins the blog aggregate.

    The nested document proves the fixtures-root validation context reaches
    models nested inside an aggregate.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_document_sidecars(fixtures_root)

    article = ArticleFixture.from_fixture(article_payload(), fixtures_root)

    assert article.title == "Sample Post"
    assert article.document is not None
    assert article.document.content == CONTENT
    assert article.document.size == len(CONTENT)
    assert [link.id for link in article.topics] == [fixture_id(16), fixture_id(17)]
    assert [link.topic.name for link in article.topics] == ["golang", "postgres"]
    assert article.topics[0].topic.description is None
    assert article.comments[1].author is None
    assert article.comments[1].created_at is None


def test_article_fixture_rejects_missing_topic_link_id(fixtures_root: Path) -> None:
    """test_article_fixture_rejects_missing_topic_link_id pins REQ-2.3 on links.

    Every `base.topic_article_link` row needs a fixture-supplied UUIDv7 primary
    key (SPEC-001 §6.1, REQ-2.3); the seeder never derives one. A topic
    association without an `id` is therefore a validation error, not an
    invitation to compute a key.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_document_sidecars(fixtures_root)
    payload = article_payload()
    del payload["topics"][0]["id"]

    with pytest.raises(ValidationError, match="id"):
        ArticleFixture.from_fixture(payload, fixtures_root)


def test_article_fixture_rejects_missing_topic_id(fixtures_root: Path) -> None:
    """test_article_fixture_rejects_missing_topic_id pins REQ-2.3 on topics.

    The topic row nested inside a link carries its own primary key, distinct
    from the link's.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_document_sidecars(fixtures_root)
    payload = article_payload()
    del payload["topics"][0]["topic"]["id"]

    with pytest.raises(ValidationError, match="id"):
        ArticleFixture.from_fixture(payload, fixtures_root)


def test_article_fixture_rejects_bare_topic(fixtures_root: Path) -> None:
    """test_article_fixture_rejects_bare_topic rejects an unwrapped topic.

    A topic embedded directly in `topics`, as the pre-amendment shape allowed,
    carries no link identifier and is rejected by `extra="forbid"`.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_document_sidecars(fixtures_root)
    payload = article_payload(topics=[{"id": fixture_id(12), "name": "golang"}])

    with pytest.raises(ValidationError):
        ArticleFixture.from_fixture(payload, fixtures_root)


def test_article_fixture_accepts_absent_document(fixtures_root: Path) -> None:
    """test_article_fixture_accepts_absent_document pins the nullable document.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    article = ArticleFixture.from_fixture(
        article_payload(document=None, topics=[], comments=[]),
        fixtures_root,
    )

    assert article.document is None
    assert article.comments == []


def test_agent_spec_fixture_accepts_valid_payload(fixtures_root: Path) -> None:
    """test_agent_spec_fixture_accepts_valid_payload pins the specs aggregate.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_document_sidecars(fixtures_root)

    spec = AgentSpecFixture.from_fixture(agent_spec_payload(), fixtures_root)

    assert spec.display_name == "Sample Spec"
    assert spec.display is True
    assert spec.documents[0].document_type is DocumentType.SPEC
    assert spec.documents[0].document.content == CONTENT


def test_agent_spec_fixture_rejects_invalid_document_type(
    fixtures_root: Path,
) -> None:
    """test_agent_spec_fixture_rejects_invalid_document_type pins the enum set.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.

    Returns:
        None
    """

    write_document_sidecars(fixtures_root)
    payload = agent_spec_payload()
    payload["documents"][0]["document_type"] = "notes"

    with pytest.raises(ValidationError, match="document_type"):
        AgentSpecFixture.from_fixture(payload, fixtures_root)


def test_document_type_matches_revision_enum() -> None:
    """test_document_type_matches_revision_enum pins the base.document_type set.

    Returns:
        None
    """

    assert [member.value for member in DocumentType] == [
        "spec",
        "acceptance",
        "other",
    ]


def test_http_method_matches_revision_enum() -> None:
    """test_http_method_matches_revision_enum pins the base.http_method set.

    Returns:
        None
    """

    assert [member.value for member in HttpMethod] == [
        "get",
        "post",
        "put",
        "patch",
        "delete",
    ]


def test_cv_experience_fixture_accepts_valid_payload() -> None:
    """test_cv_experience_fixture_accepts_valid_payload pins the CV aggregate.

    Returns:
        None
    """

    experience = CvExperienceFixture.model_validate(cv_experience_payload())

    assert experience.start_date == date(2022, 3, 1)
    assert experience.end_date is None
    assert experience.responsibilities[0].description == "Ran the platform."
    assert experience.stack_items[0].stack_item.name == "Go"


def test_cv_experience_fixture_rejects_wrong_typed_date() -> None:
    """test_cv_experience_fixture_rejects_wrong_typed_date pins the date type.

    Returns:
        None
    """

    with pytest.raises(ValidationError, match="start_date"):
        CvExperienceFixture.model_validate(
            cv_experience_payload(start_date="01/03/2022")
        )


def test_cv_skill_category_fixture_references_stack_items_by_id() -> None:
    """test_cv_skill_category_fixture_references_stack_items_by_id pins A-1.

    Returns:
        None
    """

    category = CvSkillCategoryFixture.model_validate(cv_skill_category_payload())

    assert category.category == "Languages"
    assert [link.stack_item_id for link in category.stack_items] == [
        fixture_id(33),
        fixture_id(34),
    ]


def test_cv_skill_category_fixture_cannot_define_a_stack_item() -> None:
    """test_cv_skill_category_fixture_cannot_define_a_stack_item pins ownership.

    `cv_experience.json` owns every stack item (README §5.2, A-1), so a skills
    fixture that inlines a stack-item definition is a validation error.

    Returns:
        None
    """

    payload = cv_skill_category_payload(
        stack_items=[
            {
                "id": fixture_id(41),
                "stack_item": {"id": fixture_id(33), "name": "Go"},
            }
        ]
    )

    with pytest.raises(ValidationError, match="extra_forbidden"):
        CvSkillCategoryFixture.model_validate(payload)


def test_cv_education_fixture_accepts_valid_payload() -> None:
    """test_cv_education_fixture_accepts_valid_payload pins the education model.

    Returns:
        None
    """

    education = CvEducationFixture.model_validate(cv_education_payload())

    assert education.certificate == "MSc"
    assert education.start_date == date(2014, 10, 1)
    assert education.end_date == date(2016, 7, 31)


def test_cv_education_fixture_accepts_null_end_date() -> None:
    """test_cv_education_fixture_accepts_null_end_date pins the nullable column.

    Returns:
        None
    """

    education = CvEducationFixture.model_validate(cv_education_payload(end_date=None))

    assert education.end_date is None


def test_subagent_fixture_accepts_valid_payload() -> None:
    """test_subagent_fixture_accepts_valid_payload pins the subagents model.

    Returns:
        None
    """

    subagent = SubagentFixture.model_validate(subagent_payload())

    assert subagent.name == "work-planner"
    assert subagent.inputs == {"type": "object"}


def test_subagent_fixture_accepts_undeclared_schemas() -> None:
    """test_subagent_fixture_accepts_undeclared_schemas pins the JSONB nulls.

    Returns:
        None
    """

    payload = subagent_payload(inputs=None)
    del payload["outputs"]

    subagent = SubagentFixture.model_validate(payload)

    assert subagent.inputs is None
    assert subagent.outputs is None


def test_project_fixture_accepts_valid_payload() -> None:
    """test_project_fixture_accepts_valid_payload pins the projects model.

    Returns:
        None
    """

    project = ProjectFixture.model_validate(project_payload())

    assert project.primary_link == "https://example.com"
    assert project.display is True


def test_project_fixture_defaults_display_and_allows_null_github_link() -> None:
    """test_project_fixture_defaults_display_and_allows_null_github_link pins them.

    Returns:
        None
    """

    payload = project_payload(github_link=None)
    del payload["display"]

    project = ProjectFixture.model_validate(payload)

    assert project.github_link is None
    assert project.display is True


def test_api_key_fixture_accepts_valid_payload() -> None:
    """test_api_key_fixture_accepts_valid_payload pins the API-key model.

    Returns:
        None
    """

    api_key = ApiKeyFixture.model_validate(api_key_payload())

    assert api_key.api_key == API_KEY_DIGEST
    assert api_key.expires_at is None
    assert api_key.issued_at == datetime(2024, 5, 1, 9, 30, tzinfo=timezone.utc)


def test_api_key_fixture_rejects_plaintext_key() -> None:
    """test_api_key_fixture_rejects_plaintext_key pins the SHA-256 digest format.

    Returns:
        None
    """

    with pytest.raises(ValidationError, match="api_key"):
        ApiKeyFixture.model_validate(api_key_payload(api_key="acceptance-valid-key"))


def test_admin_audit_log_fixture_accepts_valid_payload() -> None:
    """test_admin_audit_log_fixture_accepts_valid_payload pins the audit model.

    Returns:
        None
    """

    entry = AdminAuditLogFixture.model_validate(admin_audit_log_payload())

    assert entry.api_key_id == fixture_id(80)
    assert entry.method is HttpMethod.GET
    assert entry.status_code == 200
    assert entry.payload is None
    assert entry.response == {"contacts": []}


def test_admin_audit_log_fixture_accepts_null_api_key_id() -> None:
    """test_admin_audit_log_fixture_accepts_null_api_key_id pins the nullable FK.

    `base.admin_audit_log.api_key_id` is nullable so that a request presenting no
    valid API key can still be audited.

    Returns:
        None
    """

    payload = admin_audit_log_payload(api_key_id=None, status_code=403)
    del payload["response"]

    entry = AdminAuditLogFixture.model_validate(payload)

    assert entry.api_key_id is None
    assert entry.response is None


def test_admin_audit_log_fixture_rejects_invalid_method() -> None:
    """test_admin_audit_log_fixture_rejects_invalid_method pins the enum set.

    Returns:
        None
    """

    with pytest.raises(ValidationError, match="method"):
        AdminAuditLogFixture.model_validate(admin_audit_log_payload(method="options"))


def test_admin_audit_log_fixture_cannot_define_an_api_key() -> None:
    """test_admin_audit_log_fixture_cannot_define_an_api_key pins ownership.

    Returns:
        None
    """

    payload = admin_audit_log_payload(api_key={"id": fixture_id(80)})

    with pytest.raises(ValidationError, match="extra_forbidden"):
        AdminAuditLogFixture.model_validate(payload)


@pytest.mark.parametrize(("model", "build_payload"), AGGREGATE_CASES)
def test_aggregate_accepts_valid_payload(
    fixtures_root: Path,
    model: type[FixtureModel],
    build_payload: Any,
) -> None:
    """test_aggregate_accepts_valid_payload pins one happy path per domain file.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.
        model (type[FixtureModel]): The aggregate model under test.
        build_payload (Any): Builder of a valid payload for that model.

    Returns:
        None
    """

    write_document_sidecars(fixtures_root)

    assert isinstance(model.from_fixture(build_payload(), fixtures_root), model)


@pytest.mark.parametrize(("model", "build_payload"), AGGREGATE_CASES)
def test_aggregate_rejects_unknown_key(
    fixtures_root: Path,
    model: type[FixtureModel],
    build_payload: Any,
) -> None:
    """test_aggregate_rejects_unknown_key pins `extra="forbid"` on every model.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.
        model (type[FixtureModel]): The aggregate model under test.
        build_payload (Any): Builder of a valid payload for that model.

    Returns:
        None
    """

    write_document_sidecars(fixtures_root)

    with pytest.raises(ValidationError, match="extra_forbidden"):
        model.from_fixture(build_payload(created_at=TIMESTAMP), fixtures_root)


@pytest.mark.parametrize(("model", "build_payload"), AGGREGATE_CASES)
def test_aggregate_rejects_missing_top_level_id(
    fixtures_root: Path,
    model: type[FixtureModel],
    build_payload: Any,
) -> None:
    """test_aggregate_rejects_missing_top_level_id pins REQ-2.3 on every model.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.
        model (type[FixtureModel]): The aggregate model under test.
        build_payload (Any): Builder of a valid payload for that model.

    Returns:
        None
    """

    write_document_sidecars(fixtures_root)
    payload = build_payload()
    del payload["id"]

    with pytest.raises(ValidationError, match="id"):
        model.from_fixture(payload, fixtures_root)


@pytest.mark.parametrize(("model", "build_payload", "collection"), NESTED_ID_CASES)
def test_aggregate_rejects_missing_nested_id(
    fixtures_root: Path,
    model: type[FixtureModel],
    build_payload: Any,
    collection: str,
) -> None:
    """test_aggregate_rejects_missing_nested_id pins REQ-2.3 at every nesting level.

    Args:
        fixtures_root (Path): Root of the synthetic fixture tree.
        model (type[FixtureModel]): The aggregate model under test.
        build_payload (Any): Builder of a valid payload for that model.
        collection (str): Name of the nested collection whose `id` is removed.

    Returns:
        None
    """

    write_document_sidecars(fixtures_root)
    payload = build_payload()
    del payload[collection][0]["id"]

    with pytest.raises(ValidationError, match="id"):
        model.from_fixture(payload, fixtures_root)


@pytest.mark.parametrize(
    ("model", "payload"),
    [
        pytest.param(
            ApiKeyFixture,
            api_key_payload(issued_at=NAIVE_TIMESTAMP),
            id="issued_at",
        ),
        pytest.param(
            ContactFixture,
            contact_payload(
                messages=[
                    {
                        "id": fixture_id(2),
                        "content": "Interested in your work.",
                        "submitted_at": NAIVE_TIMESTAMP,
                    }
                ]
            ),
            id="submitted_at",
        ),
    ],
)
def test_aggregate_rejects_naive_timestamp(
    model: type[FixtureModel],
    payload: dict[str, Any],
) -> None:
    """test_aggregate_rejects_naive_timestamp pins timezone-aware timestamps.

    Args:
        model (type[FixtureModel]): The aggregate model under test.
        payload (dict[str, Any]): A payload carrying a naive timestamp.

    Returns:
        None
    """

    with pytest.raises(ValidationError, match="timezone"):
        model.model_validate(payload)


def test_models_module_generates_no_identifiers() -> None:
    """test_models_module_generates_no_identifiers pins RISK-011.

    Fixture IDs are pre-generated literals frozen at authoring time; the models
    must never mint one at runtime, so the module imports no UUID machinery.

    Returns:
        None
    """

    source = (SEEDING_ROOT / "src" / "models.py").read_text(encoding="utf-8").lower()

    assert "uuid.uuid" not in source
    assert "import uuid" not in source
