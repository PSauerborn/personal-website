from .contact import Contact, dump_contacts_sql
from .contact_request import ContactRequest, dump_contact_requests_sql
from .logged_request import LoggedRequest, dump_logged_requests_sql
from .logged_response import LoggedResponse, dump_logged_responses_sql


SERIALIZERS = {
    Contact: dump_contacts_sql,
    ContactRequest: dump_contact_requests_sql,
    LoggedRequest: dump_logged_requests_sql,
    LoggedResponse: dump_logged_responses_sql,
}
