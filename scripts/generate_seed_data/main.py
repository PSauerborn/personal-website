from pathlib import Path

from seed_contact_requests import seed_contact_requests
from seed_contacts import seed_contacts
from seed_logged_requests import seed_logged_requests
from seed_logged_responses import seed_logged_responses
from utils import dump_fixtures
from models import SERIALIZERS, Contact, ContactRequest, LoggedRequest, LoggedResponse


SQL_BASE_DIR = Path("outputs/sql")

CONTACTS = seed_contacts()
dump_fixtures("contacts.json", CONTACTS)

CONTACT_REQUESTS = seed_contact_requests()
dump_fixtures("contact_requests.json", CONTACT_REQUESTS)

LOGGED_REQUESTS = seed_logged_requests()
dump_fixtures("logged_requests.json", LOGGED_REQUESTS)

LOGGED_RESPONSES = seed_logged_responses()
dump_fixtures("logged_responses.json", LOGGED_RESPONSES)


SQL_BASE_DIR.mkdir(parents=True, exist_ok=True)

with open(SQL_BASE_DIR / "contacts.sql", "w") as f:
    serializer = SERIALIZERS[Contact]
    sql_content = serializer(CONTACTS)
    f.write(sql_content)

with open(SQL_BASE_DIR / "contact_requests.sql", "w") as f:
    serializer = SERIALIZERS[ContactRequest]
    sql_content = serializer(CONTACT_REQUESTS)
    f.write(sql_content)

with open(SQL_BASE_DIR / "logged_requests.sql", "w") as f:
    serializer = SERIALIZERS[LoggedRequest]
    sql_content = serializer(LOGGED_REQUESTS)
    f.write(sql_content)

with open(SQL_BASE_DIR / "logged_responses.sql", "w") as f:
    serializer = SERIALIZERS[LoggedResponse]
    sql_content = serializer(LOGGED_RESPONSES)
    f.write(sql_content)
