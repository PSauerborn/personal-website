"""added initial tables

Revision ID: 224fdf859c42
Revises:
Create Date: 2025-11-30 08:48:39.347749

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "224fdf859c42"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    op.execute("CREATE SCHEMA IF NOT EXISTS base")

    op.create_table(
        "contacts",
        sa.Column("id", sa.String, primary_key=True, nullable=False),
        sa.Column("email", sa.String, unique=True, nullable=False),
        sa.Column("name", sa.String, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        schema="base",
    )

    op.create_table(
        "contact_requests",
        sa.Column("id", sa.String, primary_key=True, nullable=False),
        sa.Column(
            "contact_id",
            sa.String,
            sa.ForeignKey("base.contacts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        schema="base",
    )

    op.create_table(
        "logged_requests",
        sa.Column("id", sa.String, primary_key=True, nullable=False),
        sa.Column("path", sa.String, nullable=False),
        sa.Column("method", sa.String, nullable=False),
        sa.Column("ip_address", sa.String, nullable=False),
        sa.Column(
            "request_ts", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        schema="base",
    )

    op.create_table(
        "logged_responses",
        sa.Column(
            "id",
            sa.String,
            sa.ForeignKey("base.logged_requests.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("status", sa.Integer, nullable=False),
        sa.Column("time_elapsed", sa.Integer, nullable=False),
        sa.Column(
            "response_ts", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        schema="base",
    )

    op.create_table(
        "api_keys",
        sa.Column("key", sa.String, primary_key=True, nullable=False),
        sa.Column("owner", sa.String, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        schema="base",
    )


def downgrade() -> None:
    """Downgrade schema."""

    op.execute("DROP SCHEMA IF EXISTS base CASCADE")
