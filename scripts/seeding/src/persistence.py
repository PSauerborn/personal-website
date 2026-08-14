"""Persistence layer of the seeding component.

This module turns validated domain aggregates into the statements that seed a
migrated database (REQ-2.5) and runs them. Planning is **pure**: no connection
is opened, no statement is executed and no I/O is performed. The functions
compute a :class:`SeedPlan` - the de-duplicated, reference-checked set of table
rows, the tables to truncate and the FK-safe insert order - and build the SQL
that :func:`execute_seed_plan` runs inside a single transaction.

Planning happens in four steps:

1. **Flatten.** Each aggregate of ``src.models`` is expanded into the rows of the
   physical tables it covers. Nested records omit their parent's foreign key, so
   flattening restores it from the parent's ``id``. No primary key is ever
   derived here: every ``id`` written by the seeder, link rows included, is the
   fixture-supplied UUIDv7 hex literal (SPEC-001 §6.1, REQ-2.3).
2. **De-duplicate.** Shared lookup rows (``base.document``, ``base.cv_stack_item``
   and the embedded ``base.topic`` records) are collapsed on their primary key.
   Two rows sharing an ``id`` must carry identical payloads; a conflict raises
   :class:`ConflictingFixtureRowError` naming the table, the ID and the differing
   fields. Silent last-write-wins is forbidden (README §5.2).
3. **Resolve references.** Every foreign-key value - whether restored from a
   parent or referenced by ID across files - must resolve to a row present in the
   flattened set, otherwise :class:`UnresolvedReferenceError` is raised before any
   database interaction. A ``NULL`` value on a nullable column resolves trivially.
4. **Order.** :data:`INSERT_ORDER` is the FK-safe order written down independently
   in ``scripts/seeding/README.md`` §6; a plan's insert order is that constant
   filtered to the tables receiving at least one row, and its truncate order is
   the reverse. A table receiving no rows is never truncated directly (REQ-2.5).

Statement building keeps every fixture value out of the SQL text: only
module-owned identifiers - the schema, table and column names declared below -
are ever interpolated, and all values travel as ``%s`` parameters. Document
content is carried as ``bytes`` so ``BYTEA`` round-trips byte-identically
(AC-10), and JSON columns are wrapped in ``psycopg`` ``Jsonb`` adapters at
build time rather than at flatten time, so rows stay directly comparable while
they are being de-duplicated.

Execution is a single unit of work. :func:`execute_seed_plan` receives a
connection the caller has already opened - it never opens one itself and never
touches a fixture file - and runs every truncation and every insert inside one
``connection.transaction()`` block. The block is followed by the module's only
commit, so a statement failing anywhere leaves the transaction unwritten and the
exception propagating to the caller: a run either seeds everything or nothing
(REQ-2.5, AC-7). Log events name tables and row counts only; the connection, the
DSN, the settings object and document content are never rendered (RISK-015).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Iterable, Mapping, Sequence

import psycopg
import structlog
from psycopg.types.json import Jsonb

from src.models import (
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

LOGGER = structlog.get_logger()

# Schema owning every table written by the seeder.
SCHEMA: str = "base"

# The FK-safe insert order of the twenty tables of SPEC-001 §6.1. This mirrors
# the order written down independently in scripts/seeding/README.md §6, which is
# the authoritative statement of the fact; the test suite asserts the two against
# each other rather than re-deriving either (RISK-007). Truncation runs in the
# reverse of this order.
INSERT_ORDER: tuple[str, ...] = (
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

# Column order used when a row is written, per table. A row may omit a column
# whose value the server defaults - base.article_comment.created_at is the only
# such column a fixture may supply (README §5.2, A-3) - but it may never carry a
# column absent from this mapping.
TABLE_COLUMNS: dict[str, tuple[str, ...]] = {
    "contact": ("id", "name", "email", "organization"),
    "message": ("id", "contact_id", "content", "read", "submitted_at"),
    "topic": ("id", "name", "description"),
    "document": ("id", "filename", "size", "restricted", "content"),
    "article": (
        "id",
        "author",
        "display",
        "title",
        "description",
        "document_id",
        "authored_at",
    ),
    "topic_article_link": ("id", "topic_id", "article_id"),
    "article_comment": ("id", "comment", "author", "article_id", "created_at"),
    "subagent": ("id", "name", "description", "inputs", "outputs"),
    "cv_stack_item": ("id", "name"),
    "cv_experience": (
        "id",
        "organization",
        "job_title",
        "start_date",
        "end_date",
        "description",
    ),
    "cv_experience_responsibility": ("id", "experience_id", "description"),
    "cv_stack_item_experience_link": ("id", "stack_item_id", "experience_id"),
    "cv_education": ("id", "institution", "certificate", "start_date", "end_date"),
    "api_key": (
        "id",
        "api_key",
        "description",
        "issued_at",
        "expires_at",
        "issued_for",
    ),
    "admin_audit_log": (
        "id",
        "api_key_id",
        "endpoint",
        "method",
        "status_code",
        "payload",
        "response",
    ),
    "agent_spec": ("id", "display_name", "description", "display"),
    "agent_spec_document_link": ("id", "spec_id", "document_id", "document_type"),
    "cv_skill_category": ("id", "category"),
    "cv_stack_item_category_link": ("id", "category_id", "stack_item_id"),
    "project": (
        "id",
        "name",
        "description",
        "primary_link",
        "github_link",
        "display",
    ),
}

# The foreign-key graph of alembic/migrations/versions/0001_initial_base_schema.py
# as (column, referenced table) pairs per table. Every pair is checked against the
# flattened rows before a statement is built, so a dangling reference fails ahead
# of any database interaction.
FOREIGN_KEYS: dict[str, tuple[tuple[str, str], ...]] = {
    "message": (("contact_id", "contact"),),
    "article": (("document_id", "document"),),
    "topic_article_link": (("topic_id", "topic"), ("article_id", "article")),
    "article_comment": (("article_id", "article"),),
    "cv_experience_responsibility": (("experience_id", "cv_experience"),),
    "cv_stack_item_experience_link": (
        ("stack_item_id", "cv_stack_item"),
        ("experience_id", "cv_experience"),
    ),
    "admin_audit_log": (("api_key_id", "api_key"),),
    "agent_spec_document_link": (
        ("spec_id", "agent_spec"),
        ("document_id", "document"),
    ),
    "cv_stack_item_category_link": (
        ("category_id", "cv_skill_category"),
        ("stack_item_id", "cv_stack_item"),
    ),
}

# Columns whose values are JSON documents and therefore need an explicit psycopg
# adapter: a bare dict is not adaptable to JSONB.
JSON_COLUMNS: dict[str, frozenset[str]] = {
    "subagent": frozenset({"inputs", "outputs"}),
    "admin_audit_log": frozenset({"payload", "response"}),
}

# A single table row, keyed by column name.
Row = dict[str, Any]

# Rows grouped by the table that receives them, in the order they were flattened.
TableRows = dict[str, list[Row]]


class PersistenceError(Exception):
    """PersistenceError is the base of every seeding planning failure."""


class ConflictingFixtureRowError(PersistenceError):
    """ConflictingFixtureRowError reports two rows sharing an ID but not a payload."""


class UnresolvedReferenceError(PersistenceError):
    """UnresolvedReferenceError reports a foreign key that no fixture row satisfies."""


@dataclass(frozen=True)
class SeedPlan:
    """SeedPlan is the fully resolved, ordered set of rows to seed.

    Attributes:
        rows (Mapping[str, tuple[Row, ...]]): The de-duplicated rows of every
            table receiving at least one row, keyed by table name. A table
            receiving no rows is absent.
    """

    rows: Mapping[str, tuple[Row, ...]]

    @property
    def insert_order(self) -> tuple[str, ...]:
        """insert_order returns the seeded tables in FK-safe insert order.

        Returns:
            tuple[str, ...]: The tables receiving at least one row, ordered by
                `INSERT_ORDER`.
        """

        return tuple(table for table in INSERT_ORDER if table in self.rows)

    @property
    def truncate_order(self) -> tuple[str, ...]:
        """truncate_order returns the seeded tables in truncation order.

        Returns:
            tuple[str, ...]: The insert order reversed, so children are truncated
                before their parents.
        """

        return tuple(reversed(self.insert_order))


@dataclass(frozen=True)
class InsertStatement:
    """InsertStatement is one parameterised INSERT and its parameter sets.

    Attributes:
        table (str): Unqualified name of the table the rows are written to.
        sql (str): The statement text. Carries `%s` placeholders only; no fixture
            value is ever interpolated into it.
        parameters (tuple[tuple[Any, ...], ...]): One parameter tuple per row,
            aligned with the statement's column list.
    """

    table: str
    sql: str
    parameters: tuple[tuple[Any, ...], ...]


def enum_value(value: Any) -> Any:
    """enum_value unwraps an enum member to the value stored in the column.

    Args:
        value (Any): A value taken from a validated fixture.

    Returns:
        Any: The member's value for an enum, the value itself otherwise.
    """

    return value.value if isinstance(value, Enum) else value


def merge_table_rows(groups: Iterable[TableRows]) -> TableRows:
    """merge_table_rows concatenates several flattened row groups.

    Args:
        groups (Iterable[TableRows]): The row groups to merge, in order.

    Returns:
        TableRows: The rows of every group, concatenated per table in the order
            the groups were supplied.
    """

    merged: TableRows = {}
    for group in groups:
        for table, rows in group.items():
            merged.setdefault(table, []).extend(rows)

    return merged


def flatten_contact(fixture: ContactFixture) -> TableRows:
    """flatten_contact flattens a contact aggregate into contact and message rows.

    Args:
        fixture (ContactFixture): The validated contact aggregate.

    Returns:
        TableRows: The `contact` row and one `message` row per embedded message.
    """

    rows: TableRows = {
        "contact": [
            {
                "id": fixture.id,
                "name": fixture.name,
                "email": fixture.email,
                "organization": fixture.organization,
            }
        ]
    }

    if fixture.messages:
        rows["message"] = [
            {
                "id": message.id,
                "contact_id": fixture.id,
                "content": message.content,
                "read": message.read,
                "submitted_at": message.submitted_at,
            }
            for message in fixture.messages
        ]

    return rows


def flatten_document(fixture: Any) -> Row:
    """flatten_document flattens a document fixture into a document row.

    Args:
        fixture (Any): The validated document fixture.

    Returns:
        Row: The `document` row, whose content is the sidecar file's bytes.
    """

    return {
        "id": fixture.id,
        "filename": fixture.filename,
        "size": fixture.size,
        "restricted": fixture.restricted,
        "content": fixture.content,
    }


def flatten_article(fixture: ArticleFixture) -> TableRows:
    """flatten_article flattens a blog aggregate into its five tables.

    Args:
        fixture (ArticleFixture): The validated article aggregate.

    Returns:
        TableRows: The `document`, `article`, `topic`, `topic_article_link` and
            `article_comment` rows the aggregate owns.
    """

    rows: TableRows = {
        "article": [
            {
                "id": fixture.id,
                "author": fixture.author,
                "display": fixture.display,
                "title": fixture.title,
                "description": fixture.description,
                "document_id": fixture.document.id if fixture.document else None,
                "authored_at": fixture.authored_at,
            }
        ]
    }

    if fixture.document is not None:
        rows["document"] = [flatten_document(fixture.document)]

    if fixture.topics:
        rows["topic"] = [
            {
                "id": link.topic.id,
                "name": link.topic.name,
                "description": link.topic.description,
            }
            for link in fixture.topics
        ]
        rows["topic_article_link"] = [
            {
                "id": link.id,
                "topic_id": link.topic.id,
                "article_id": fixture.id,
            }
            for link in fixture.topics
        ]

    if fixture.comments:
        rows["article_comment"] = [
            flatten_article_comment(comment, article_id=fixture.id)
            for comment in fixture.comments
        ]

    return rows


def flatten_article_comment(fixture: Any, article_id: str) -> Row:
    """flatten_article_comment flattens one comment of an article.

    ``created_at`` is emitted only when the fixture supplies it: the column is
    NOT NULL with a server default, so an absent value must be omitted from the
    insert rather than passed as NULL.

    Args:
        fixture (Any): The validated comment fixture.
        article_id (str): ID of the article the comment belongs to.

    Returns:
        Row: The `article_comment` row.
    """

    row: Row = {
        "id": fixture.id,
        "comment": fixture.comment,
        "author": fixture.author,
        "article_id": article_id,
    }

    if fixture.created_at is not None:
        row["created_at"] = fixture.created_at

    return row


def flatten_agent_spec(fixture: AgentSpecFixture) -> TableRows:
    """flatten_agent_spec flattens a spec aggregate into its three tables.

    Args:
        fixture (AgentSpecFixture): The validated spec aggregate.

    Returns:
        TableRows: The `agent_spec` row plus the `document` and
            `agent_spec_document_link` rows of every linked document.
    """

    rows: TableRows = {
        "agent_spec": [
            {
                "id": fixture.id,
                "display_name": fixture.display_name,
                "description": fixture.description,
                "display": fixture.display,
            }
        ]
    }

    if fixture.documents:
        rows["document"] = [
            flatten_document(link.document) for link in fixture.documents
        ]
        rows["agent_spec_document_link"] = [
            {
                "id": link.id,
                "spec_id": fixture.id,
                "document_id": link.document.id,
                "document_type": enum_value(link.document_type),
            }
            for link in fixture.documents
        ]

    return rows


def flatten_cv_experience(fixture: CvExperienceFixture) -> TableRows:
    """flatten_cv_experience flattens a CV experience aggregate into four tables.

    Args:
        fixture (CvExperienceFixture): The validated experience aggregate.

    Returns:
        TableRows: The `cv_experience` row, its responsibilities, the
            `cv_stack_item` rows it owns and their links.
    """

    rows: TableRows = {
        "cv_experience": [
            {
                "id": fixture.id,
                "organization": fixture.organization,
                "job_title": fixture.job_title,
                "start_date": fixture.start_date,
                "end_date": fixture.end_date,
                "description": fixture.description,
            }
        ]
    }

    if fixture.responsibilities:
        rows["cv_experience_responsibility"] = [
            {
                "id": responsibility.id,
                "experience_id": fixture.id,
                "description": responsibility.description,
            }
            for responsibility in fixture.responsibilities
        ]

    if fixture.stack_items:
        rows["cv_stack_item"] = [
            {"id": link.stack_item.id, "name": link.stack_item.name}
            for link in fixture.stack_items
        ]
        rows["cv_stack_item_experience_link"] = [
            {
                "id": link.id,
                "stack_item_id": link.stack_item.id,
                "experience_id": fixture.id,
            }
            for link in fixture.stack_items
        ]

    return rows


def flatten_cv_skill_category(fixture: CvSkillCategoryFixture) -> TableRows:
    """flatten_cv_skill_category flattens a skill category and its links.

    The stack items are referenced by ID only - ``cv_experience.json`` owns every
    stack-item row (README §5.2, A-1) - so no `cv_stack_item` row is produced here.

    Args:
        fixture (CvSkillCategoryFixture): The validated category aggregate.

    Returns:
        TableRows: The `cv_skill_category` row and its category links.
    """

    rows: TableRows = {
        "cv_skill_category": [{"id": fixture.id, "category": fixture.category}]
    }

    if fixture.stack_items:
        rows["cv_stack_item_category_link"] = [
            {
                "id": link.id,
                "category_id": fixture.id,
                "stack_item_id": link.stack_item_id,
            }
            for link in fixture.stack_items
        ]

    return rows


def flatten_cv_education(fixture: CvEducationFixture) -> TableRows:
    """flatten_cv_education flattens an education aggregate.

    Args:
        fixture (CvEducationFixture): The validated education aggregate.

    Returns:
        TableRows: The single `cv_education` row.
    """

    return {
        "cv_education": [
            {
                "id": fixture.id,
                "institution": fixture.institution,
                "certificate": fixture.certificate,
                "start_date": fixture.start_date,
                "end_date": fixture.end_date,
            }
        ]
    }


def flatten_subagent(fixture: SubagentFixture) -> TableRows:
    """flatten_subagent flattens a subagent aggregate.

    Args:
        fixture (SubagentFixture): The validated subagent aggregate.

    Returns:
        TableRows: The single `subagent` row.
    """

    return {
        "subagent": [
            {
                "id": fixture.id,
                "name": fixture.name,
                "description": fixture.description,
                "inputs": fixture.inputs,
                "outputs": fixture.outputs,
            }
        ]
    }


def flatten_project(fixture: ProjectFixture) -> TableRows:
    """flatten_project flattens a project aggregate.

    Args:
        fixture (ProjectFixture): The validated project aggregate.

    Returns:
        TableRows: The single `project` row.
    """

    return {
        "project": [
            {
                "id": fixture.id,
                "name": fixture.name,
                "description": fixture.description,
                "primary_link": fixture.primary_link,
                "github_link": fixture.github_link,
                "display": fixture.display,
            }
        ]
    }


def flatten_api_key(fixture: ApiKeyFixture) -> TableRows:
    """flatten_api_key flattens an API-key aggregate.

    Args:
        fixture (ApiKeyFixture): The validated API-key aggregate.

    Returns:
        TableRows: The single `api_key` row.
    """

    return {
        "api_key": [
            {
                "id": fixture.id,
                "api_key": fixture.api_key,
                "description": fixture.description,
                "issued_at": fixture.issued_at,
                "expires_at": fixture.expires_at,
                "issued_for": fixture.issued_for,
            }
        ]
    }


def flatten_admin_audit_log(fixture: AdminAuditLogFixture) -> TableRows:
    """flatten_admin_audit_log flattens an audit-log aggregate.

    Args:
        fixture (AdminAuditLogFixture): The validated audit-log aggregate.

    Returns:
        TableRows: The single `admin_audit_log` row.
    """

    return {
        "admin_audit_log": [
            {
                "id": fixture.id,
                "api_key_id": fixture.api_key_id,
                "endpoint": fixture.endpoint,
                "method": enum_value(fixture.method),
                "status_code": fixture.status_code,
                "payload": fixture.payload,
                "response": fixture.response,
            }
        ]
    }


# Flattening function per aggregate model. One entry per fixture file of the
# catalogue in scripts/seeding/README.md §4.
FLATTENERS: dict[type, Callable[[Any], TableRows]] = {
    ContactFixture: flatten_contact,
    ArticleFixture: flatten_article,
    AgentSpecFixture: flatten_agent_spec,
    CvExperienceFixture: flatten_cv_experience,
    CvSkillCategoryFixture: flatten_cv_skill_category,
    CvEducationFixture: flatten_cv_education,
    SubagentFixture: flatten_subagent,
    ProjectFixture: flatten_project,
    ApiKeyFixture: flatten_api_key,
    AdminAuditLogFixture: flatten_admin_audit_log,
}


def flatten_fixture(fixture: Any) -> TableRows:
    """flatten_fixture expands one validated aggregate into per-table rows.

    Args:
        fixture (Any): A validated domain aggregate of `src.models`.

    Returns:
        TableRows: The rows of every table the aggregate owns. A table the
            aggregate contributes no rows to is absent.

    Raises:
        TypeError: If the object is not one of the domain aggregates.
    """

    flattener = FLATTENERS.get(type(fixture))
    if flattener is None:
        raise TypeError(
            f"cannot flatten '{type(fixture).__name__}': it is not a domain "
            "aggregate of the fixture catalogue"
        )

    return flattener(fixture)


def flatten_fixtures(fixtures: Iterable[Any]) -> TableRows:
    """flatten_fixtures expands every validated aggregate into per-table rows.

    Args:
        fixtures (Iterable[Any]): The validated domain aggregates, in the order
            their files were loaded.

    Returns:
        TableRows: The rows of every table any aggregate owns, still carrying the
            duplicate shared-lookup rows.

    Raises:
        TypeError: If any object is not one of the domain aggregates.
    """

    return merge_table_rows(flatten_fixture(fixture) for fixture in fixtures)


def differing_fields(left: Row, right: Row) -> tuple[str, ...]:
    """differing_fields lists the columns two rows disagree on.

    Args:
        left (Row): The row seen first.
        right (Row): The row seen second.

    Returns:
        tuple[str, ...]: Every column present in exactly one row or holding
            different values in the two, in the order it appears.
    """

    columns = list(left) + [column for column in right if column not in left]
    sentinel = object()
    return tuple(
        column
        for column in columns
        if left.get(column, sentinel) != right.get(column, sentinel)
    )


def deduplicate_rows(table: str, rows: Sequence[Row]) -> tuple[Row, ...]:
    """deduplicate_rows collapses rows of one table that share a primary key.

    Args:
        table (str): Unqualified name of the table the rows belong to.
        rows (Sequence[Row]): The flattened rows, in insertion order.

    Returns:
        tuple[Row, ...]: One row per distinct ID, in first-seen order.

    Raises:
        ConflictingFixtureRowError: If two rows share an ID but not a payload.
    """

    unique: dict[str, Row] = {}
    for row in rows:
        identifier = row["id"]
        seen = unique.get(identifier)
        if seen is None:
            unique[identifier] = row
            continue

        if seen != row:
            fields = ", ".join(differing_fields(seen, row))
            raise ConflictingFixtureRowError(
                f"conflicting fixture rows for {SCHEMA}.{table} id "
                f"'{identifier}': the payloads differ on {fields}. Two fixtures "
                "may share a row only if their payloads are identical."
            )

    return tuple(unique.values())


def deduplicate_table_rows(rows: TableRows) -> dict[str, tuple[Row, ...]]:
    """deduplicate_table_rows collapses shared rows across every table.

    Args:
        rows (TableRows): The flattened rows of every table.

    Returns:
        dict[str, tuple[Row, ...]]: The de-duplicated rows per table.

    Raises:
        ConflictingFixtureRowError: If two rows of a table share an ID but not a
            payload.
    """

    return {
        table: deduplicate_rows(table, table_rows) for table, table_rows in rows.items()
    }


def validate_references(rows: Mapping[str, Sequence[Row]]) -> None:
    """validate_references checks every foreign key against the flattened rows.

    Args:
        rows (Mapping[str, Sequence[Row]]): The de-duplicated rows per table.

    Returns:
        None

    Raises:
        UnresolvedReferenceError: If a non-null foreign key names a row that no
            fixture defines.
    """

    known = {
        table: {row["id"] for row in table_rows} for table, table_rows in rows.items()
    }

    for table, table_rows in rows.items():
        for column, target in FOREIGN_KEYS.get(table, ()):
            for row in table_rows:
                value = row.get(column)
                if value is None or value in known.get(target, set()):
                    continue

                raise UnresolvedReferenceError(
                    f"{SCHEMA}.{table}.{column} of row '{row['id']}' references "
                    f"'{value}', which no fixture defines as a {SCHEMA}.{target} "
                    "row"
                )


def build_seed_plan(fixtures: Iterable[Any]) -> SeedPlan:
    """build_seed_plan turns validated aggregates into an executable seed plan.

    The aggregates are flattened, their shared lookup rows de-duplicated and
    every foreign key resolved. All three steps are pure, so an invalid fixture
    set fails before any database interaction.

    Args:
        fixtures (Iterable[Any]): The validated domain aggregates.

    Returns:
        SeedPlan: The de-duplicated rows of every table receiving at least one
            row, carrying the FK-safe insert and truncate orders.

    Raises:
        TypeError: If any object is not one of the domain aggregates.
        ConflictingFixtureRowError: If two rows of a table share an ID but not a
            payload.
        UnresolvedReferenceError: If a foreign key resolves to no defined row.
    """

    rows = deduplicate_table_rows(flatten_fixtures(fixtures))
    validate_references(rows)

    return SeedPlan(rows=rows)


def build_truncate_statements(plan: SeedPlan) -> tuple[str, ...]:
    """build_truncate_statements builds one cascading truncate per seeded table.

    Only tables receiving at least one row are truncated directly; anything else
    is emptied solely as a cascade effect (REQ-2.5). The statements are ordered
    children before parents.

    Args:
        plan (SeedPlan): The plan whose tables are truncated.

    Returns:
        tuple[str, ...]: One `TRUNCATE ... CASCADE` statement per seeded table.
    """

    return tuple(
        f"TRUNCATE TABLE {SCHEMA}.{table} CASCADE" for table in plan.truncate_order
    )


def row_columns(table: str, row: Row) -> tuple[str, ...]:
    """row_columns returns the columns a row writes, in canonical order.

    Args:
        table (str): Unqualified name of the table the row belongs to.
        row (Row): The row to inspect.

    Returns:
        tuple[str, ...]: The table's columns that the row supplies a value for.
    """

    return tuple(column for column in TABLE_COLUMNS[table] if column in row)


def row_parameters(table: str, columns: Sequence[str], row: Row) -> tuple[Any, ...]:
    """row_parameters extracts a row's values as statement parameters.

    JSON values are wrapped in a `Jsonb` adapter, since `psycopg` does not adapt
    a bare mapping to `JSONB`. Every other value - including document content,
    which stays `bytes` so `BYTEA` round-trips byte-identically - is passed
    through unchanged.

    Args:
        table (str): Unqualified name of the table the row belongs to.
        columns (Sequence[str]): The columns of the statement, in order.
        row (Row): The row to extract values from.

    Returns:
        tuple[Any, ...]: One parameter per column, in the statement's order.
    """

    json_columns = JSON_COLUMNS.get(table, frozenset())
    return tuple(
        (
            Jsonb(row[column])
            if column in json_columns and row[column] is not None
            else row[column]
        )
        for column in columns
    )


def build_insert_statement(
    table: str, columns: Sequence[str], rows: Sequence[Row]
) -> InsertStatement:
    """build_insert_statement builds one parameterised insert for a row group.

    Only the schema, table and column names owned by this module are interpolated
    into the statement text; every fixture value travels as a `%s` parameter.

    Args:
        table (str): Unqualified name of the table the rows are written to.
        columns (Sequence[str]): The columns written, in canonical order.
        rows (Sequence[Row]): The rows writing exactly those columns.

    Returns:
        InsertStatement: The statement and one parameter tuple per row.
    """

    names = ", ".join(columns)
    placeholders = ", ".join("%s" for _ in columns)

    return InsertStatement(
        table=table,
        sql=f"INSERT INTO {SCHEMA}.{table} ({names}) VALUES ({placeholders})",
        parameters=tuple(row_parameters(table, columns, row) for row in rows),
    )


def build_insert_statements(plan: SeedPlan) -> tuple[InsertStatement, ...]:
    """build_insert_statements builds the inserts of a plan in FK-safe order.

    Rows of one table that write different column sets - a comment with an
    explicit `created_at` and one without - are grouped into separate statements,
    so a column a fixture leaves out is never sent as NULL to a NOT NULL column
    with a server default.

    Args:
        plan (SeedPlan): The plan whose rows are written.

    Returns:
        tuple[InsertStatement, ...]: The statements, ordered parents before
            children and, within a table, by first appearance of the column set.
    """

    statements: list[InsertStatement] = []
    for table in plan.insert_order:
        groups: dict[tuple[str, ...], list[Row]] = {}
        for row in plan.rows[table]:
            groups.setdefault(row_columns(table, row), []).append(row)

        statements.extend(
            build_insert_statement(table, columns, rows)
            for columns, rows in groups.items()
        )

    return tuple(statements)


def execute_seed_plan(connection: psycopg.Connection, plan: SeedPlan) -> int:
    """execute_seed_plan seeds a migrated database from a plan atomically.

    The connection must already be open, must have auto-commit disabled and is
    never created, configured or closed here. Every truncation and every insert
    runs inside one transaction block, truncations first so each seeded table is
    emptied exactly once before it receives its first row (REQ-2.5). Leaving the
    block is what commits the work, so any failure propagates with nothing
    written (AC-7) and a repeated run reproduces the same row set (AC-8).

    The explicit commit call that follows the block is not a second unit of
    work: with a real `psycopg.Connection` the outermost transaction block has
    already committed, and the call is a no-op on an idle connection. It is kept
    so the commit is explicit at the one place that owns it, and because the
    test suite's fake connection - whose transaction block deliberately performs
    no implicit commit, so that entry and exit can be observed separately - would
    otherwise never record a commit at all.

    Args:
        connection (psycopg.Connection): An open connection with a transaction
            pending; the caller owns its lifetime.
        plan (SeedPlan): The resolved plan whose rows are written.

    Returns:
        int: The number of rows inserted across every table.

    Raises:
        Exception: Whatever the driver raises for a failing statement, after the
            transaction block has been left without committing.
    """

    truncations = build_truncate_statements(plan)
    insertions = build_insert_statements(plan)
    written = sum(len(statement.parameters) for statement in insertions)

    LOGGER.info(
        "seeding migrated database",
        schema=SCHEMA,
        tables=len(plan.insert_order),
        rows=written,
        statements=len(insertions),
    )

    with connection.transaction():
        with connection.cursor() as cursor:
            for truncation in truncations:
                cursor.execute(truncation)

            LOGGER.info("truncated seeded tables", tables=len(truncations))

            for statement in insertions:
                cursor.executemany(statement.sql, statement.parameters)
                LOGGER.info(
                    "inserted table rows",
                    table=f"{SCHEMA}.{statement.table}",
                    rows=len(statement.parameters),
                )

    connection.commit()
    LOGGER.info(
        "committed seeding transaction", tables=len(plan.insert_order), rows=written
    )

    return written
