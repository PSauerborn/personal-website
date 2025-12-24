import random
from datetime import date

from faker import Faker


Faker.seed(45602)
random.seed(45602)

FAKER = Faker()

CONTACT_COUNT = 100

MAX_CONTACT_REQUESTS_PER_CONTACT = 3

START_DATE = date(2020, 1, 1)
END_DATE = date(2024, 12, 31)

GET_REQUEST_PATHS = [
    "/api/v1/public/resume",
    "/api/v1/public/health",
]
