from enum import Enum
from datetime import datetime

from pydantic import BaseModel, StringConstraints
from typing_extensions import Annotated


class MethodEnum(str, Enum):
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    DELETE = "DELETE"
    PATCH = "PATCH"


class LoggedRequest(BaseModel):
    request_id: Annotated[str, StringConstraints(min_length=1)]
    method: MethodEnum
    path: Annotated[str, StringConstraints(min_length=1)]
    request_ts: datetime
    ip_address: Annotated[str, StringConstraints(min_length=7)]  # Simple length check


def dump_logged_requests_sql(logged_requests: list[LoggedRequest]) -> str:

    statement = "INSERT INTO base.logged_requests (id, method, path, request_ts, ip_address) VALUES\n"  # noqa: E501

    for i, lr in enumerate(logged_requests):
        if i == len(logged_requests) - 1:
            sql_content = f"  ('{lr.request_id}', '{lr.method.value}', '{lr.path}', '{lr.request_ts}', '{lr.ip_address}');\n"  # noqa: E501
        else:
            sql_content = f"  ('{lr.request_id}', '{lr.method.value}', '{lr.path}', '{lr.request_ts}', '{lr.ip_address}'),\n"  # noqa: E501
        statement += sql_content

    return statement
