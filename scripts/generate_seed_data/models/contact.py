from datetime import datetime

from pydantic import BaseModel, StringConstraints
from typing_extensions import Annotated


class Contact(BaseModel):
    contact_id: Annotated[str, StringConstraints(min_length=1)]
    name: Annotated[str, StringConstraints(min_length=1)]
    email: Annotated[str, StringConstraints(min_length=5)]
    created_at: datetime
    ip_address: Annotated[str, StringConstraints(min_length=7)]


def dump_contacts_sql(contacts: list[Contact]) -> str:

    statement = "INSERT INTO base.contacts (id, name, email, created_at) VALUES\n"

    for i, c in enumerate(contacts):
        if i == len(contacts) - 1:
            sql_content = f"  ('{c.contact_id}', '{c.name}', '{c.email}', '{c.created_at.isoformat()}');\n"  # noqa: E501
        else:
            sql_content = f"  ('{c.contact_id}', '{c.name}', '{c.email}', '{c.created_at.isoformat()}'),\n"  # noqa: E501
        statement += sql_content

    return statement
