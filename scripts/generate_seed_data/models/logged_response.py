from datetime import datetime

from pydantic import BaseModel, StringConstraints
from typing_extensions import Annotated


class LoggedResponse(BaseModel):
    request_id: Annotated[str, StringConstraints(min_length=1)]
    status_code: int
    response_ts: datetime
    time_elapsed: int


def dump_logged_responses_sql(logged_responses: list[LoggedResponse]) -> str:

    statement = "INSERT INTO base.logged_responses (id, status, response_ts, time_elapsed) VALUES\n"  # noqa: E501

    for i, lr in enumerate(logged_responses):
        if i == len(logged_responses) - 1:
            sql_content = f"  ('{lr.request_id}', {lr.status_code}, '{lr.response_ts}', {lr.time_elapsed});\n"  # noqa: E501
        else:
            sql_content = f"  ('{lr.request_id}', {lr.status_code}, '{lr.response_ts}', {lr.time_elapsed}),\n"  # noqa: E501
        statement += sql_content

    return statement
