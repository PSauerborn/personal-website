from models.contact import Contact

from constants import CONTACT_COUNT, FAKER, START_DATE, END_DATE


def create_contact() -> Contact:

    first_name = FAKER.first_name()
    last_name = FAKER.last_name()

    return Contact(
        contact_id=str(FAKER.uuid4()).replace("-", ""),
        name=f"{first_name} {last_name}",
        email=f"{first_name.lower()}.{last_name.lower()}@example.com",
        created_at=FAKER.date_between(START_DATE, END_DATE),
        ip_address=FAKER.ipv4(),
    )


def seed_contacts() -> list[Contact]:

    contacts = []
    for _ in range(CONTACT_COUNT):
        contact = create_contact()
        contacts.append(contact)
    return contacts
