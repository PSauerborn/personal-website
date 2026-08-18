"""Domain fixture models for the seeding component.

Every fixture file under ``scripts/seeding/fixtures/`` is validated through the
models defined here before a single database statement is issued. The models are
therefore the enforcement point for the fixture contract documented in
``scripts/seeding/README.md``.

Binding decision F-1 (``docs/specs/SPEC-001-REVIEW.md`` §6a) governs document
content: a document fixture's ``content`` field holds a **path relative to the
fixtures root**, never inline content. The seeder resolves that path, reads the
file in binary mode, and derives ``base.document.size`` from the byte length. A
fixture may never supply ``size`` itself, and a path that is absolute, escapes
the fixtures root, does not exist, or resolves to an empty file is a validation
error.

The fixtures root is injected rather than discovered: pass it explicitly to
``from_fixture``, or supply it through the pydantic validation context under
``FIXTURES_ROOT_CONTEXT_KEY``. Validation without a root fails loudly instead of
silently resolving paths against the process working directory.

The models are **domain aggregates, not one model per table** (REQ-2.4): there is
exactly one aggregate model per fixture file of the catalogue in
``scripts/seeding/README.md`` §4, and ``DOMAIN_FIXTURE_MODELS`` maps each file
name to its model. An aggregate embeds the rows it owns — a contact embeds its
messages, an article embeds its topics, comments and document — and the
persistence layer flattens the aggregate back into table rows. Rows owned by
*another* file are referenced by ID only, which is what keeps shared-lookup
ownership (README §5.2) enforceable at validation time: a CV skills fixture
cannot define a stack item, and an audit-log fixture cannot define an API key.

Every field mirrors its column in
``alembic/migrations/versions/0001_initial_base_schema.py`` in name, type,
nullability and default. Two columns are deliberately absent from the models:
``created_at`` and ``updated_at`` are server defaults, never fixture supplied.
The single exception is ``base.article_comment.created_at``, which is optional
here because comment ordering is asserted by the acceptance suite and every row
of a single transaction otherwise shares one ``now()`` (README §5.2, A-3).

Identifiers are pre-generated literals frozen at fixture-authoring time (README
§7); nothing here mints one at runtime.
"""

from __future__ import annotations

from datetime import date
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    ValidationInfo,
    model_validator,
)
from typing_extensions import Annotated, Self

FIXTURES_ROOT_CONTEXT_KEY: str = "fixtures_root"

CONTENT_FIELD: str = "content"
SIZE_FIELD: str = "size"

# Width of every primary key in the base schema: a UUIDv7 rendered as lower-case
# hex with its hyphens removed (SPEC-001 §6.1, REQ-2.3).
ID_LENGTH: int = 32
ID_PATTERN: str = r"^[0-9a-f]{32}$"

# Width of base.document.filename.
FILENAME_MAX_LENGTH: int = 255

# Column widths shared across the base schema: VARCHAR(128) for lookup names,
# VARCHAR(255) for display names, VARCHAR(320) for email addresses and
# VARCHAR(512) for URLs and endpoint paths.
SHORT_NAME_MAX_LENGTH: int = 128
NAME_MAX_LENGTH: int = 255
EMAIL_MAX_LENGTH: int = 320
LINK_MAX_LENGTH: int = 512

# Width and alphabet of base.api_key.api_key: a SHA-256 digest as lower-case hex.
API_KEY_LENGTH: int = 64
API_KEY_PATTERN: str = r"^[0-9a-f]{64}$"

# Bounds of base.admin_audit_log.status_code.
MIN_STATUS_CODE: int = 100
MAX_STATUS_CODE: int = 599

FixtureId = Annotated[
    str,
    StringConstraints(
        min_length=ID_LENGTH,
        max_length=ID_LENGTH,
        pattern=ID_PATTERN,
    ),
]

# A VARCHAR(128) lookup name, such as base.topic.name.
ShortName = Annotated[
    str,
    StringConstraints(min_length=1, max_length=SHORT_NAME_MAX_LENGTH),
]

# A VARCHAR(255) display value, such as base.article.title.
Name = Annotated[
    str,
    StringConstraints(min_length=1, max_length=NAME_MAX_LENGTH),
]

# A VARCHAR(320) email address, such as base.contact.email.
Email = Annotated[
    str,
    StringConstraints(min_length=1, max_length=EMAIL_MAX_LENGTH),
]

# A VARCHAR(512) URL or endpoint path, such as base.project.primary_link.
Link = Annotated[
    str,
    StringConstraints(min_length=1, max_length=LINK_MAX_LENGTH),
]

# An unbounded TEXT column, such as base.message.content. Never empty: a NULL is
# the way to express "not set" (see the nullable variants on the models below).
FreeText = Annotated[str, StringConstraints(min_length=1)]

# The SHA-256 digest stored in base.api_key.api_key. Plaintext keys are never
# stored, so a fixture supplying one is a validation error rather than a runtime
# authentication failure.
ApiKeyDigest = Annotated[
    str,
    StringConstraints(
        min_length=API_KEY_LENGTH,
        max_length=API_KEY_LENGTH,
        pattern=API_KEY_PATTERN,
    ),
]

# A JSONB column, such as base.subagent.inputs.
JsonObject = dict[str, Any]


class HttpMethod(str, Enum):
    """HttpMethod is the base.http_method enum type.

    The members and their order are taken verbatim from the ``http_method`` type
    declared by revision 0001.
    """

    GET = "get"
    POST = "post"
    PUT = "put"
    PATCH = "patch"
    DELETE = "delete"


class DocumentType(str, Enum):
    """DocumentType is the base.document_type enum type.

    The members and their order are taken verbatim from the ``document_type``
    type declared by revision 0001.
    """

    SPEC = "spec"
    ACCEPTANCE = "acceptance"
    OTHER = "other"


def resolve_fixtures_root(info: ValidationInfo) -> Path:
    """resolve_fixtures_root extracts the fixtures root from a validation context.

    Args:
        info (ValidationInfo): The validation context pydantic passes to the
            validator.

    Returns:
        Path: The fully resolved fixtures root.

    Raises:
        ValueError: If no fixtures root was supplied by the caller.
    """

    context = info.context if isinstance(info.context, dict) else {}
    root = context.get(FIXTURES_ROOT_CONTEXT_KEY)
    if root is None:
        raise ValueError(
            "no fixtures root supplied: validate document fixtures via "
            "DocumentFixture.from_fixture, or pass the root in the validation "
            f"context under '{FIXTURES_ROOT_CONTEXT_KEY}'"
        )

    return Path(root).resolve()


def resolve_sidecar_path(content: Any, fixtures_root: Path) -> Path:
    """resolve_sidecar_path resolves a sidecar path inside the fixtures root.

    The supplied path and the fixtures root are both fully resolved before they
    are compared, so ``..`` segments and symlinks pointing out of the tree are
    caught by the same containment check.

    Args:
        content (Any): The fixture-supplied ``content`` value, expected to be a
            path relative to the fixtures root.
        fixtures_root (Path): The fully resolved fixtures root.

    Returns:
        Path: The resolved absolute path of the sidecar file.

    Raises:
        ValueError: If the value is not a path, is absolute, or resolves outside
            the fixtures root.
    """

    if not isinstance(content, (str, Path)):
        raise ValueError(
            "content must be a path relative to the fixtures root, not inline "
            "content"
        )

    candidate = Path(content)
    if candidate.is_absolute():
        raise ValueError(f"content path '{candidate}' is absolute")

    resolved = (fixtures_root / candidate).resolve()
    if not resolved.is_relative_to(fixtures_root):
        raise ValueError(
            f"content path '{candidate}' resolves outside the fixtures root "
            f"'{fixtures_root}'"
        )

    return resolved


def read_sidecar_content(content: Any, fixtures_root: Path) -> bytes:
    """read_sidecar_content reads a contained sidecar file as bytes.

    The file is read with ``Path.read_bytes()``: the content is never decoded to
    text, so the bytes reaching ``base.document.content`` are byte-identical to
    the file on disk (AC-10).

    Args:
        content (Any): The fixture-supplied ``content`` value, expected to be a
            path relative to the fixtures root.
        fixtures_root (Path): The fully resolved fixtures root.

    Returns:
        bytes: The full content of the sidecar file.

    Raises:
        ValueError: If the path is invalid, the file does not exist, or the file
            is empty.
    """

    resolved = resolve_sidecar_path(content=content, fixtures_root=fixtures_root)
    if not resolved.is_file():
        raise ValueError(f"content file '{content}' does not exist")

    payload = resolved.read_bytes()
    if not payload:
        raise ValueError(f"content file '{content}' is empty")

    return payload


class FixtureModel(BaseModel):
    """FixtureModel is the shared base of every fixture model.

    Unknown keys are rejected outright so that a typo, a renamed column, or a
    fixture-supplied value for a derived field (such as ``base.document.size``)
    fails validation rather than being silently dropped.
    """

    model_config = ConfigDict(extra="forbid")

    @classmethod
    def from_fixture(cls, data: Any, fixtures_root: Path) -> Self:
        """from_fixture validates a payload against an explicit fixtures root.

        The root is passed through the validation context, which pydantic
        propagates into every nested model, so a document nested several levels
        inside an aggregate resolves its sidecar against the same root.

        Args:
            data (Any): The raw fixture payload.
            fixtures_root (Path): Root that document `content` paths are
                resolved against.

        Returns:
            Self: The validated fixture record.

        Raises:
            pydantic.ValidationError: If the payload violates the fixture
                contract.
        """

        return cls.model_validate(
            data,
            context={FIXTURES_ROOT_CONTEXT_KEY: fixtures_root},
        )


class IdentifiedFixtureModel(FixtureModel):
    """IdentifiedFixtureModel is the base of every fixture model with a row ID.

    Attributes:
        id (FixtureId): Primary key of the row. A UUIDv7 rendered as lower-case
            hex with hyphens removed, pre-generated at fixture-authoring time and
            frozen from that moment (REQ-2.3).
    """

    id: FixtureId


class DocumentFixture(IdentifiedFixtureModel):
    """DocumentFixture is a validated ``base.document`` row.

    The fixture supplies ``content`` as a path relative to the fixtures root; the
    validated model holds the file's bytes and the size derived from them.

    Attributes:
        id (FixtureId): Primary key of the document row.
        filename (str): Name of the stored file, including its extension.
        restricted (bool): True if the document is admin only, false if public.
            Defaults to True, matching the schema's server default, so a public
            document must set it explicitly.
        content (bytes): The sidecar file's content, read in binary mode.
        size (int): Byte length of `content`. Derived, never fixture-supplied.
    """

    filename: Annotated[
        str,
        StringConstraints(min_length=1, max_length=FILENAME_MAX_LENGTH),
    ]
    restricted: bool = True
    content: bytes
    size: Annotated[int, Field(ge=1)]

    @model_validator(mode="before")
    @classmethod
    def resolve_content(cls, data: Any, info: ValidationInfo) -> Any:
        """resolve_content replaces the sidecar path with its bytes and size.

        Args:
            data (Any): The raw fixture payload.
            info (ValidationInfo): The validation context carrying the fixtures
                root.

        Returns:
            Any: The payload with `content` read as bytes and `size` derived from
                its byte length.

        Raises:
            ValueError: If the fixture supplies `size`, or if the sidecar path is
                absent, invalid, escaping, missing or empty.
        """

        if not isinstance(data, dict):
            return data

        if SIZE_FIELD in data:
            raise ValueError(
                "size is derived from the sidecar file and must not be supplied "
                "by a fixture"
            )

        if CONTENT_FIELD not in data:
            return data

        fixtures_root = resolve_fixtures_root(info)
        payload = read_sidecar_content(
            content=data[CONTENT_FIELD],
            fixtures_root=fixtures_root,
        )

        return {**data, CONTENT_FIELD: payload, SIZE_FIELD: len(payload)}


class MessageFixture(IdentifiedFixtureModel):
    """MessageFixture is a validated ``base.message`` row.

    ``contact_id`` is not a field: the owning contact is expressed by nesting and
    is restored when the aggregate is flattened to table rows.

    Attributes:
        id (FixtureId): Primary key of the message row.
        content (FreeText): Free-form body of the message as submitted.
        read (bool): True once an admin has marked the message as read.
            Defaults to False, matching the schema's server default.
        submitted_at (AwareDatetime): UTC timestamp of submission. Required and
            non-defaulted, so it is always fixture supplied.
    """

    content: FreeText
    read: bool = False
    submitted_at: AwareDatetime


class ContactFixture(IdentifiedFixtureModel):
    """ContactFixture is the ``contacts.json`` aggregate: a contact's messages.

    Attributes:
        id (FixtureId): Primary key of the contact row.
        name (Name): Full name of the contact.
        email (Email): Email address of the contact. Unique across all contacts,
            which the database enforces.
        organization (Name | None): Organization the contact represents, or None
            if not provided.
        messages (list[MessageFixture]): Messages submitted by this contact.
    """

    name: Name
    email: Email
    organization: Name | None = None
    messages: list[MessageFixture] = Field(default_factory=list)


class TopicFixture(IdentifiedFixtureModel):
    """TopicFixture is a validated ``base.topic`` row.

    Topics are a shared lookup: the same topic is embedded by every article
    carrying it, and the persistence layer de-duplicates the rows on `id`
    (README §5.2). Two records sharing an `id` must be byte identical.

    Attributes:
        id (FixtureId): Primary key of the topic row.
        name (ShortName): Topic name, for example golang or terraform.
        description (str | None): Description of the topic, or None.
    """

    name: ShortName
    description: FreeText | None = None


class ArticleTopicLinkFixture(IdentifiedFixtureModel):
    """ArticleTopicLinkFixture is a validated ``base.topic_article_link`` row.

    ``article_id`` is not a field: the owning article is expressed by nesting.
    The link carries its **own** primary key, distinct from the topic's: every
    ID used as a primary key is a fixture-supplied UUIDv7 hex literal (SPEC-001
    §6.1, REQ-2.3), so no link key is ever derived from the IDs it joins. The
    topic itself is embedded because it is a shared lookup, de-duplicated on its
    own `id` by the persistence layer.

    Attributes:
        id (FixtureId): Primary key of the link row.
        topic (TopicFixture): The topic linked to the article.
    """

    topic: TopicFixture


class ArticleCommentFixture(IdentifiedFixtureModel):
    """ArticleCommentFixture is a validated ``base.article_comment`` row.

    Attributes:
        id (FixtureId): Primary key of the comment row.
        comment (FreeText): Free-form body of the comment.
        author (Name | None): Name of the commenter, or None if anonymous.
        created_at (AwareDatetime | None): Explicit creation timestamp. Optional,
            and the only place a fixture may supply one: comment ordering is
            asserted by the acceptance suite, and the server default `now()` is
            the transaction timestamp, identical for every seeded row (A-3).
    """

    comment: FreeText
    author: Name | None = None
    created_at: AwareDatetime | None = None


class ArticleFixture(IdentifiedFixtureModel):
    """ArticleFixture is the ``blog.json`` aggregate: an article and everything
    hanging off it.

    Attributes:
        id (FixtureId): Primary key of the article row.
        author (Name): Name of the article author.
        title (Name): Title of the article.
        description (FreeText): Short description of the article contents.
        display (bool): Controls whether the article is shown on the website.
            Defaults to True, matching the schema's server default.
        authored_at (AwareDatetime): UTC timestamp at which the article was
            authored. Required and non-defaulted.
        document (DocumentFixture | None): The document holding the article body,
            owned by this aggregate, or None while no content is attached.
        topics (list[ArticleTopicLinkFixture]): Topic links of the article, each
            carrying the link row's own ID alongside the linked topic.
        comments (list[ArticleCommentFixture]): Comments made on the article.
    """

    author: Name
    title: Name
    description: FreeText
    display: bool = True
    authored_at: AwareDatetime
    document: DocumentFixture | None = None
    topics: list[ArticleTopicLinkFixture] = Field(default_factory=list)
    comments: list[ArticleCommentFixture] = Field(default_factory=list)


class AgentSpecDocumentLinkFixture(IdentifiedFixtureModel):
    """AgentSpecDocumentLinkFixture is a ``base.agent_spec_document_link`` row.

    ``spec_id`` is not a field: the owning spec is expressed by nesting.

    Attributes:
        id (FixtureId): Primary key of the link row.
        document_type (DocumentType): Role the document plays for the spec.
        document (DocumentFixture): The linked document, owned by this aggregate.
    """

    document_type: DocumentType
    document: DocumentFixture


class AgentSpecFixture(IdentifiedFixtureModel):
    """AgentSpecFixture is the ``agent_specs.json`` aggregate: a spec and the
    documents linked to it.

    Attributes:
        id (FixtureId): Primary key of the spec row.
        display_name (Name): Name of the spec as shown on the website.
        description (FreeText): Description of what the spec provides.
        display (bool): Controls whether the spec is shown on the website.
            Defaults to True, matching the schema's server default.
        documents (list[AgentSpecDocumentLinkFixture]): Documents linked to the
            spec, each with the role it plays.
    """

    display_name: Name
    description: FreeText
    display: bool = True
    documents: list[AgentSpecDocumentLinkFixture] = Field(default_factory=list)


class CvStackItemFixture(IdentifiedFixtureModel):
    """CvStackItemFixture is a validated ``base.cv_stack_item`` row.

    Stack items are owned by ``cv_experience.json`` (README §5.2, A-1) and are
    de-duplicated on `id` by the persistence layer.

    Attributes:
        id (FixtureId): Primary key of the stack-item row.
        name (ShortName): Name of the technology, for example golang.
    """

    name: ShortName


class CvExperienceResponsibilityFixture(IdentifiedFixtureModel):
    """CvExperienceResponsibilityFixture is a responsibility of an experience.

    ``experience_id`` is not a field: the owning experience is expressed by
    nesting.

    Attributes:
        id (FixtureId): Primary key of the responsibility row.
        description (FreeText): Free-form description of the responsibility.
    """

    description: FreeText


class CvStackItemExperienceLinkFixture(IdentifiedFixtureModel):
    """CvStackItemExperienceLinkFixture links a stack item to an experience.

    ``experience_id`` is not a field: the owning experience is expressed by
    nesting. The stack item itself is defined here because this file owns it.

    Attributes:
        id (FixtureId): Primary key of the link row.
        stack_item (CvStackItemFixture): The stack item used in the experience.
    """

    stack_item: CvStackItemFixture


class CvExperienceFixture(IdentifiedFixtureModel):
    """CvExperienceFixture is the ``cv_experience.json`` aggregate: one CV
    experience with its responsibilities and stack items.

    Attributes:
        id (FixtureId): Primary key of the experience row.
        organization (Name): Organization the experience was gained at.
        job_title (Name): Job title held during the experience.
        start_date (date): Date the role started.
        end_date (date | None): Date the role ended, or None while current.
        description (FreeText): Free-form description of the role.
        responsibilities (list[CvExperienceResponsibilityFixture]):
            Responsibilities held during the role.
        stack_items (list[CvStackItemExperienceLinkFixture]): Stack items used
            during the role. This file owns every stack-item row.
    """

    organization: Name
    job_title: Name
    start_date: date
    end_date: date | None = None
    description: FreeText
    responsibilities: list[CvExperienceResponsibilityFixture] = Field(
        default_factory=list
    )
    stack_items: list[CvStackItemExperienceLinkFixture] = Field(default_factory=list)


class CvStackItemCategoryLinkFixture(IdentifiedFixtureModel):
    """CvStackItemCategoryLinkFixture links a stack item to a skill category.

    The stack item is referenced by **ID only**: ``cv_experience.json`` owns
    every ``base.cv_stack_item`` row, so an inline definition here is rejected by
    ``extra="forbid"``. Whether the referenced ID resolves is checked at link
    time by the persistence layer, not here.

    Attributes:
        id (FixtureId): Primary key of the link row.
        stack_item_id (FixtureId): ID of the referenced stack item.
    """

    stack_item_id: FixtureId


class CvSkillCategoryFixture(IdentifiedFixtureModel):
    """CvSkillCategoryFixture is the ``cv_skills.json`` aggregate: one skill
    category and the stack items grouped under it.

    Attributes:
        id (FixtureId): Primary key of the category row.
        category (ShortName): Skill grouping, for example Languages.
        stack_items (list[CvStackItemCategoryLinkFixture]): References to the
            stack items belonging to this category.
    """

    category: ShortName
    stack_items: list[CvStackItemCategoryLinkFixture] = Field(default_factory=list)


class CvEducationFixture(IdentifiedFixtureModel):
    """CvEducationFixture is the ``cv_education.json`` aggregate.

    Attributes:
        id (FixtureId): Primary key of the education row.
        institution (Name): Institution the certificate was obtained at.
        certificate (ShortName): Type of certificate, for example MSc.
        start_date (date): Date the course started.
        end_date (date | None): Date the course ended, or None while ongoing.
    """

    institution: Name
    certificate: ShortName
    start_date: date
    end_date: date | None = None


class SubagentFixture(IdentifiedFixtureModel):
    """SubagentFixture is the ``subagents.json`` aggregate.

    Attributes:
        id (FixtureId): Primary key of the subagent row.
        name (ShortName): Name of the subagent as shown in the catalogue.
        description (FreeText): Description of what the subagent does.
        inputs (JsonObject | None): Input schema, or None if undeclared.
        outputs (JsonObject | None): Output schema, or None if undeclared.
    """

    name: ShortName
    description: FreeText
    inputs: JsonObject | None = None
    outputs: JsonObject | None = None


class ProjectFixture(IdentifiedFixtureModel):
    """ProjectFixture is the ``projects.json`` aggregate.

    Attributes:
        id (FixtureId): Primary key of the project row.
        name (Name): Name of the project.
        description (FreeText): Description of what the project does.
        primary_link (Link): Primary URL of the project.
        github_link (Link | None): GitHub URL, or None if not public.
        display (bool): Controls whether the project is shown on the website.
            Defaults to True, matching the schema's server default.
    """

    name: Name
    description: FreeText
    primary_link: Link
    github_link: Link | None = None
    display: bool = True


class ApiKeyFixture(IdentifiedFixtureModel):
    """ApiKeyFixture is the ``api_keys.json`` aggregate.

    Attributes:
        id (FixtureId): Primary key of the API-key row.
        api_key (ApiKeyDigest): SHA-256 digest of the key as 64 lower-case hex
            characters. Plaintext keys are never stored.
        description (FreeText): Description of what the key is used for.
        issued_at (AwareDatetime): UTC timestamp at which the key was issued.
            Required and non-defaulted.
        expires_at (AwareDatetime | None): UTC expiry timestamp, or None if the
            key never expires.
        issued_for (Name): Name of the user the key was issued to.
    """

    api_key: ApiKeyDigest
    description: FreeText
    issued_at: AwareDatetime
    expires_at: AwareDatetime | None = None
    issued_for: Name


class AdminAuditLogFixture(IdentifiedFixtureModel):
    """AdminAuditLogFixture is the ``admin_audit_log.json`` aggregate.

    The API key is referenced by **ID only**: ``api_keys.json`` owns every
    ``base.api_key`` row. Whether the referenced ID resolves is checked at link
    time by the persistence layer, not here.

    Attributes:
        id (FixtureId): Primary key of the audit-log row.
        api_key_id (FixtureId | None): ID of the API key the request
            authenticated with, or None when the request presented no valid key.
            The column is nullable so that an unauthenticated or invalid-key
            request remains auditable.
        endpoint (Link): Path of the admin endpoint that was called.
        method (HttpMethod): HTTP method of the request.
        status_code (int): HTTP status code returned by the endpoint.
        payload (JsonObject | None): Request payload, or None if it had no body.
        response (JsonObject | None): Response payload, or None if it had no
            body.
    """

    api_key_id: FixtureId | None = None
    endpoint: Link
    method: HttpMethod
    status_code: Annotated[int, Field(ge=MIN_STATUS_CODE, le=MAX_STATUS_CODE)]
    payload: JsonObject | None = None
    response: JsonObject | None = None


# The fixture catalogue of scripts/seeding/README.md section 4 as code: every
# domain fixture file, mapped to the single aggregate model that validates one
# element of its JSON array. Adding a table never adds an entry here - only a new
# domain file does.
DOMAIN_FIXTURE_MODELS: dict[str, type[IdentifiedFixtureModel]] = {
    "contacts.json": ContactFixture,
    "blog.json": ArticleFixture,
    "agent_specs.json": AgentSpecFixture,
    "cv_experience.json": CvExperienceFixture,
    "cv_skills.json": CvSkillCategoryFixture,
    "cv_education.json": CvEducationFixture,
    "subagents.json": SubagentFixture,
    "projects.json": ProjectFixture,
    "api_keys.json": ApiKeyFixture,
    "admin_audit_log.json": AdminAuditLogFixture,
}
