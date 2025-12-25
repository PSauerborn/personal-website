import random

from models.logged_response import LoggedResponse
from models.logged_request import LoggedRequest

from utils import load_fixtures


def create_logged_response(logged_request: LoggedRequest) -> LoggedResponse:

    return LoggedResponse(
        request_id=logged_request.request_id,
        status_code=200 if random.random() < 0.9 else 500,
        response_ts=logged_request.request_ts,
        time_elapsed=random.randint(100, 2000),
    )


def seed_logged_responses() -> list[LoggedResponse]:

    logged_responses = []
    logged_requests = load_fixtures("logged_requests.json", LoggedRequest)

    for logged_request in logged_requests:
        logged_response = create_logged_response(logged_request)
        logged_responses.append(logged_response)
    return logged_responses
