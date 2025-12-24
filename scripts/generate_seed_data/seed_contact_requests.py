import random

from models.contact import Contact
from models.contact_request import ContactRequest
from utils import load_fixtures
from constants import MAX_CONTACT_REQUESTS_PER_CONTACT, FAKER, END_DATE


def create_contact_request(contact: Contact) -> ContactRequest:

    return ContactRequest(
        request_id=str(FAKER.uuid4()).replace("-", ""),
        contact_id=contact.contact_id,
        message=FAKER.paragraph(nb_sentences=5),
        created_at=FAKER.date_between(contact.created_at, END_DATE),
        ip_address=contact.ip_address,
    )


def seed_contact_requests() -> list[ContactRequest]:

    contacts = load_fixtures("contacts.json", Contact)
    contact_requests = []

    for contact in contacts:
        # Decide randomly how many contact requests to create for this contact
        count = random.randint(1, MAX_CONTACT_REQUESTS_PER_CONTACT)
        for _ in range(count):
            contact_request = create_contact_request(contact)
            contact_requests.append(contact_request)

    return contact_requests
