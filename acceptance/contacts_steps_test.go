package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/cucumber/godog"
)

// noContactExistsWithEmail verifies that no contact with the given email exists in the system.
func (a *ApiFeature) noContactExistsWithEmail(email string) error {
	response, err := a.ListContacts()
	if err != nil {
		return err
	}

	if response.StatusCode != http.StatusOK {
		return errors.New("contact exists")
	}

	var contacts struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&contacts); err != nil {
		return err
	}

	for _, contact := range contacts.Data {
		if contact["email"] == email {
			return fmt.Errorf("contact with email %s already exists", email)
		}
	}
	return nil
}

// iSubmitAContactRequest submits a new contact request with the provided details.
func (a *ApiFeature) iSubmitAContactRequest(name, email, message string) error {
	payload := map[string]string{
		"name":    name,
		"email":   email,
		"message": message,
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	body := bytes.NewBuffer(encoded)

	url := fmt.Sprintf("%s/api/v1/public/contacts", API_BASE_URL)
	request, err := http.NewRequest("POST", url, body)
	if err != nil {
		return err
	}

	response, err := a.ExecuteRequest(request)
	if err != nil {
		return err
	}

	a.resp = response
	return nil
}

// theContactShouldBeAdded verifies that a contact with the given email has been added to the system.
func (a *ApiFeature) theContactShouldBeAdded(email string) error {
	response, err := a.ListContacts()
	if err != nil {
		return err
	}

	if response.StatusCode != http.StatusOK {
		return errors.New("contact exists")
	}

	var contacts struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&contacts); err != nil {
		return err
	}

	for _, contact := range contacts.Data {
		if contact["email"] == email {
			return nil
		}
	}
	return fmt.Errorf("contact with email %s does not exist", email)
}

// noDuplicateContact verifies that there is only one contact with the given email.
func (a *ApiFeature) noDuplicateContact(email string) error {
	response, err := a.ListContacts()
	if err != nil {
		return err
	}

	if response.StatusCode != http.StatusOK {
		return errors.New("contact exists")
	}

	var contacts struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&contacts); err != nil {
		return err
	}

	count := 0
	for _, contact := range contacts.Data {
		if contact["email"] == email {
			count++
		}
	}
	if count > 1 {
		return fmt.Errorf("contact with email %s exists more than once", email)
	}
	return nil
}

// contactExistsWithEmail verifies that a contact with the given email already exists.
func (a *ApiFeature) contactExistsWithEmail(email string) error {
	response, err := a.ListContacts()
	if err != nil {
		return err
	}

	if response.StatusCode != http.StatusOK {
		return errors.New("contact exists")
	}

	var contacts struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&contacts); err != nil {
		return err
	}

	for _, contact := range contacts.Data {
		if contact["email"] == email {
			return nil
		}
	}
	return fmt.Errorf("contact with email %s does not exist", email)
}

// RegisterContactSteps registers all contact-related steps in the scenario context.
func RegisterContactSteps(ctx *godog.ScenarioContext, api *ApiFeature) {
	ctx.Step(`^a contact exists with the email "([^"]*)"$`, api.contactExistsWithEmail)
	ctx.Step(`^no contact exists with the email "([^"]*)"$`, api.noContactExistsWithEmail)
	ctx.Step(`^I submit a contact request with name "([^"]*)" and email "([^"]*)" and message "([^"]*)"$`, api.iSubmitAContactRequest)
	ctx.Step(`^the contact "([^"]*)" should be added$`, api.theContactShouldBeAdded)
	ctx.Step(`^the contact "([^"]*)" should not be added$`, api.noContactExistsWithEmail)
	ctx.Step(`^the contact "([^"]*)" should not be added again$`, api.noDuplicateContact)
}
