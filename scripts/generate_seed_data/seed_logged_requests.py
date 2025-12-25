from models.contact_request import ContactRequest
from models.logged_request import LoggedRequest

from utils import load_fixtures
from constants import FAKER, GET_REQUEST_PATHS


def create_logged_request_from_contact_request(
    contact_request: ContactRequest,
) -> LoggedRequest:

    return LoggedRequest(
        request_id=str(FAKER.uuid4()).replace("-", ""),
        method="POST",
        path="/api/v1/public/contact",
        ip_address=contact_request.ip_address,
        request_ts=contact_request.created_at,
    )


def create_logged_request_from_get_path(path: str) -> LoggedRequest:

    return LoggedRequest(
        request_id=str(FAKER.uuid4()).replace("-", ""),
        method="GET",
        path=path,
        ip_address=FAKER.ipv4(),
        request_ts=FAKER.date_time_between(start_date="-2y", end_date="now"),
    )


def seed_logged_requests() -> list[LoggedRequest]:

    contact_requests = load_fixtures("contact_requests.json", ContactRequest)

    logged_requests = []
    for contact_request in contact_requests:
        logged_request = create_logged_request_from_contact_request(contact_request)
        logged_requests.append(logged_request)

    for path in GET_REQUEST_PATHS:
        # Create a random number of GET requests for each path
        for _ in range(FAKER.random_int(min=20, max=50)):
            logged_request = create_logged_request_from_get_path(path)
            logged_requests.append(logged_request)

    return logged_requests
