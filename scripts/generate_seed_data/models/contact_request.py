from datetime import datetime

from pydantic import BaseModel, StringConstraints
from typing_extensions import Annotated


class ContactRequest(BaseModel):
    contact_id: Annotated[str, StringConstraints(min_length=1)]
    request_id: Annotated[str, StringConstraints(min_length=1)]
    message: Annotated[str, StringConstraints(min_length=1)]
    created_at: datetime
    ip_address: Annotated[str, StringConstraints(min_length=7)]


def dump_contact_requests_sql(contact_requests: list[ContactRequest]) -> str:

    statement = "INSERT INTO base.contact_requests (id, contact_id, message, created_at) VALUES\n"  # noqa: E501

    for i, cr in enumerate(contact_requests):
        if i == len(contact_requests) - 1:
            sql_content = f"  ('{cr.request_id}', '{cr.contact_id}', '{cr.message}', '{cr.created_at.isoformat()}');\n"  # noqa: E501
        else:
            sql_content = f"  ('{cr.request_id}', '{cr.contact_id}', '{cr.message}', '{cr.created_at.isoformat()}'),\n"  # noqa: E501
        statement += sql_content

    return statement
