package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	// contactByEmailQuery resolves an existing contact by email. Contact
	// identity is determined entirely by the email address, which the unique
	// index uq_contact_email makes at most one row (REQ-5.2).
	contactByEmailQuery = `SELECT id FROM base.contact WHERE email = $1`
	// contactInsertQuery records a new contact and returns the identifier of the
	// contact that ends up holding the email address. created_at and updated_at
	// are left to the schema defaults so that they always come from the database
	// clock. The conflict clause targets uq_contact_email (docs/db_schema.md
	// §4.1): a concurrent submission carrying the same, previously unseen email
	// would otherwise make this insert violate that constraint and fail an
	// entirely valid submission. The conflict is resolved with DO UPDATE rather
	// than with DO NOTHING because only DO UPDATE waits for the conflicting
	// transaction to end and then returns the surviving row: DO NOTHING reports
	// no inserted row immediately, and a follow-up read under READ COMMITTED
	// cannot see a contact the winning transaction has not committed yet, which
	// would fail an entirely valid submission with a 500. The update is a no-op
	// write of the conflicting email onto itself, so it changes no stored value
	// (REQ-5.2).
	contactInsertQuery = `INSERT INTO base.contact (id, name, email, organization)
	VALUES ($1, $2, $3, $4)
	ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
	RETURNING id`
	// messageInsertQuery records a new message against a resolved contact. The
	// read flag and the submission timestamp are supplied by this layer rather
	// than by the caller (REQ-5.5).
	messageInsertQuery = `INSERT INTO base.message (id, contact_id, content, "read", submitted_at) VALUES ($1, $2, $3, $4, $5)`
)

// CreateMessage records a contact form submission and returns the identifier
// generated for the message (AC-33, [GO-042]). The contact is resolved by email
// and created only when no contact holds that address yet, so that repeated
// submissions from the same sender never produce a duplicate contact (REQ-5.2,
// AC-34). Both writes share a single transaction: a failing message insert
// rolls the contact insert back and leaves no orphaned contact behind
// (REQ-5.4, [GO-036]). The message is always persisted as unread and stamped
// with the server side UTC receipt time (REQ-5.5, AC-38). Errors are logged
// with their database detail and returned as ErrDatabaseUnavailable, so that no
// SQL leaks past this layer.
func (db *PostgresPersistenceLayer) CreateMessage(ctx context.Context, submission MessageSubmission) (string, error) {
	messageID, err := NewID()
	if err != nil {
		return "", err
	}

	// The email is lowercased defensively: contact identity depends on it, so
	// the lookup and the insert must never disagree about its casing
	// (REQ-5.3).
	email := strings.ToLower(submission.Email)
	submittedAt := time.Now().UTC()

	err = runInTransaction(ctx, db.pool, func(tx pgx.Tx) error {
		contactID, err := resolveContactID(ctx, tx, submission, email)
		if err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, messageInsertQuery, messageID, contactID, submission.Content, false, submittedAt); err != nil {
			Logger().WithError(err).Error("unable to insert message")
			return fmt.Errorf("%w: unable to insert message", ErrDatabaseUnavailable)
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	return messageID, nil
}

// resolveContactID returns the identifier of the contact holding the given
// email address, creating that contact when none does yet (REQ-5.2). It runs on
// the transaction of its caller so that a contact it creates is rolled back
// together with a failing message insert (REQ-5.4). The resolution is
// idempotent: the lookup and the insert are not atomic against a concurrent
// transaction submitting the same first-time email, so the insert resolves the
// conflict itself. Its ON CONFLICT ... DO UPDATE clause waits for the
// conflicting transaction to end and then returns the identifier of the contact
// that survives it — the one this call inserted, or the one the winning
// transaction committed — in a single statement. No re-read follows it: a read
// issued after the conflict would run under READ COMMITTED and could not see a
// contact the winning transaction had not committed yet, which would fail a
// perfectly valid submission.
func resolveContactID(ctx context.Context, tx pgx.Tx, submission MessageSubmission, email string) (string, error) {
	contactID, err := lookupContactID(ctx, tx, email)
	if err == nil || !errors.Is(err, pgx.ErrNoRows) {
		return contactID, err
	}

	newContactID, err := NewID()
	if err != nil {
		return "", err
	}

	var resolvedID string
	err = tx.QueryRow(ctx, contactInsertQuery, newContactID, submission.Name, email, submission.Organization).
		Scan(&resolvedID)
	if err != nil {
		Logger().WithError(err).Error("unable to insert contact")
		return "", fmt.Errorf("%w: unable to insert contact", ErrDatabaseUnavailable)
	}
	return resolvedID, nil
}

// lookupContactID returns the identifier of the contact holding the given email
// address on the given transaction. It returns pgx.ErrNoRows unwrapped when no
// contact holds it, so that callers can tell a missing contact apart from a
// failed lookup, and an error wrapping ErrDatabaseUnavailable for every other
// failure.
func lookupContactID(ctx context.Context, tx pgx.Tx, email string) (string, error) {
	var contactID string
	err := tx.QueryRow(ctx, contactByEmailQuery, email).Scan(&contactID)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return "", err
	case err != nil:
		Logger().WithError(err).Error("unable to look up contact by email")
		return "", fmt.Errorf("%w: unable to look up contact", ErrDatabaseUnavailable)
	}
	return contactID, nil
}
