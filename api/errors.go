package main

type APIKeyNotFoundError struct {
	Key string
}

func (e APIKeyNotFoundError) Error() string {
	return "api key not found " + e.Key
}

type ContactNotFoundError struct {
	Email string
}

func (e ContactNotFoundError) Error() string {
	return "contact not found with email " + e.Email
}
