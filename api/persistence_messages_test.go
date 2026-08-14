package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newMessageSubmission returns a sanitized submission as the application layer
// hands it to persistence, so that each test only states the field it cares
// about.
func newMessageSubmission(organization *string) MessageSubmission {
	return MessageSubmission{
		Name:         "Pascal Sauerborn",
		Email:        "visitor@example.com",
		Organization: organization,
		Content:      "I would like to get in touch",
	}
}

// TestPostgresPersistenceLayerCreateMessageNewContact tests the message write for
// a sender that is not yet known: the contact and the message are created inside
// a single transaction, the email is lower-cased for both lookup and insertion,
// and an omitted organization is persisted as SQL NULL (REQ-5.2, REQ-5.4,
// [GO-036]).
func TestPostgresPersistenceLayerCreateMessageNewContact(t *testing.T) {
	organization := "Acme Ltd"

	t.Run("creates one contact and one message inside a single transaction", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		insertedContactID := &capturedArg{}
		messageContactID := &capturedArg{}
		insertedMessageID := &capturedArg{}

		mock.ExpectBegin()
		mock.ExpectQuery(contactByEmailQuery).
			WithArgs("visitor@example.com").
			WillReturnError(pgx.ErrNoRows)
		// The upsert returns the id of the surviving contact, which for an
		// uncontended insert is the id this layer generated.
		mock.ExpectQuery(contactInsertQuery).
			WithArgs(insertedContactID, "Pascal Sauerborn", "visitor@example.com", &organization).
			WillReturnRows(pgxmock.NewRows([]string{"id"}).AddRow("inserted-contact-id"))
		mock.ExpectExec(messageInsertQuery).
			WithArgs(insertedMessageID, messageContactID, "I would like to get in touch", false, pgxmock.AnyArg()).
			WillReturnResult(pgxmock.NewResult("INSERT", 1))
		mock.ExpectCommit()

		messageID, err := persistence.CreateMessage(context.Background(), newMessageSubmission(&organization))

		require.NoError(t, err)
		assert.Equal(t, insertedMessageID.value, messageID, "the returned id must be the persisted message id")
		assert.Regexp(t, hexIDPattern, messageID, "message ids must be 32 character hex uuidv7 values")
		assert.Regexp(t, hexIDPattern, insertedContactID.value, "contact ids must be 32 character hex uuidv7 values")
		assert.Equal(t, "inserted-contact-id", messageContactID.value,
			"the message must be linked to the contact the insert resolved in the same transaction")
	})

	t.Run("lowercases the email used for lookup and insertion", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(contactByEmailQuery).
			WithArgs("visitor@example.com").
			WillReturnError(pgx.ErrNoRows)
		mock.ExpectQuery(contactInsertQuery).
			WithArgs(pgxmock.AnyArg(), "Pascal Sauerborn", "visitor@example.com", (*string)(nil)).
			WillReturnRows(pgxmock.NewRows([]string{"id"}).AddRow("inserted-contact-id"))
		mock.ExpectExec(messageInsertQuery).
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), false, pgxmock.AnyArg()).
			WillReturnResult(pgxmock.NewResult("INSERT", 1))
		mock.ExpectCommit()

		submission := newMessageSubmission(nil)
		submission.Email = "Visitor@Example.com"

		_, err := persistence.CreateMessage(context.Background(), submission)

		assert.NoError(t, err)
	})

	t.Run("persists an omitted organization as SQL NULL", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		insertedOrganization := &capturedArg{}

		mock.ExpectBegin()
		mock.ExpectQuery(contactByEmailQuery).
			WithArgs("visitor@example.com").
			WillReturnError(pgx.ErrNoRows)
		mock.ExpectQuery(contactInsertQuery).
			WithArgs(pgxmock.AnyArg(), "Pascal Sauerborn", "visitor@example.com", insertedOrganization).
			WillReturnRows(pgxmock.NewRows([]string{"id"}).AddRow("inserted-contact-id"))
		mock.ExpectExec(messageInsertQuery).
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), false, pgxmock.AnyArg()).
			WillReturnResult(pgxmock.NewResult("INSERT", 1))
		mock.ExpectCommit()

		_, err := persistence.CreateMessage(context.Background(), newMessageSubmission(nil))

		require.NoError(t, err)
		assert.Nil(t, insertedOrganization.value, "an omitted organization must reach the database as NULL")
	})
}

// TestPostgresPersistenceLayerCreateMessageExistingContact tests that a
// submission from a known email address reuses the existing contact rather than
// inserting a duplicate (REQ-5.2).
func TestPostgresPersistenceLayerCreateMessageExistingContact(t *testing.T) {
	t.Run("reuses the existing contact without inserting a duplicate", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		messageContactID := &capturedArg{}

		mock.ExpectBegin()
		mock.ExpectQuery(contactByEmailQuery).
			WithArgs("visitor@example.com").
			WillReturnRows(pgxmock.NewRows([]string{"id"}).AddRow("existing-contact-id"))
		// No contact INSERT is registered: an unexpected one fails the test.
		mock.ExpectExec(messageInsertQuery).
			WithArgs(pgxmock.AnyArg(), messageContactID, "I would like to get in touch", false, pgxmock.AnyArg()).
			WillReturnResult(pgxmock.NewResult("INSERT", 1))
		mock.ExpectCommit()

		messageID, err := persistence.CreateMessage(context.Background(), newMessageSubmission(nil))

		require.NoError(t, err)
		assert.Regexp(t, hexIDPattern, messageID)
		assert.Equal(t, "existing-contact-id", messageContactID.value,
			"the message must be linked to the contact already holding the email")
	})
}

// TestPostgresPersistenceLayerCreateMessageConcurrentContact tests that a
// first-time email submitted twice concurrently, which makes both transactions
// miss the contact lookup and attempt the insert, does not fail the second
// insert with a duplicate key: it must yield the contact the winning
// transaction created (REQ-5.2, AC-34).
func TestPostgresPersistenceLayerCreateMessageConcurrentContact(t *testing.T) {
	t.Run("inserts the contact tolerating a concurrent insert of the same email", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(contactByEmailQuery).
			WithArgs("visitor@example.com").
			WillReturnError(pgx.ErrNoRows)
		mock.ExpectQuery(contactInsertQuery).
			WithArgs(pgxmock.AnyArg(), "Pascal Sauerborn", "visitor@example.com", (*string)(nil)).
			WillReturnRows(pgxmock.NewRows([]string{"id"}).AddRow("inserted-contact-id"))
		mock.ExpectExec(messageInsertQuery).
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), false, pgxmock.AnyArg()).
			WillReturnResult(pgxmock.NewResult("INSERT", 1))
		mock.ExpectCommit()

		_, err := persistence.CreateMessage(context.Background(), newMessageSubmission(nil))

		assert.NoError(t, err)
	})

	// The upsert is the whole conflict resolution: it blocks on the concurrent
	// writer and returns the id of the contact that survives, so the losing
	// submission attaches to it rather than being answered with a 500. No
	// second contact lookup is registered on the mock, so a re-read - which
	// under READ COMMITTED could not see an uncommitted winner - fails the test.
	t.Run("attaches the message to the contact the conflicting transaction created", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		messageContactID := &capturedArg{}

		mock.ExpectBegin()
		mock.ExpectQuery(contactByEmailQuery).
			WithArgs("visitor@example.com").
			WillReturnError(pgx.ErrNoRows)
		mock.ExpectQuery(contactInsertQuery).
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnRows(pgxmock.NewRows([]string{"id"}).AddRow("existing-contact-id"))
		mock.ExpectExec(messageInsertQuery).
			WithArgs(pgxmock.AnyArg(), messageContactID, "I would like to get in touch", false, pgxmock.AnyArg()).
			WillReturnResult(pgxmock.NewResult("INSERT", 1))
		mock.ExpectCommit()

		messageID, err := persistence.CreateMessage(context.Background(), newMessageSubmission(nil))

		require.NoError(t, err)
		assert.Regexp(t, hexIDPattern, messageID)
		assert.Equal(t, "existing-contact-id", messageContactID.value,
			"the message must be linked to the contact the winning transaction created")
	})

	t.Run("resolves the conflict without re-reading the contact", func(t *testing.T) {
		assert.Contains(t, contactInsertQuery, "ON CONFLICT (email) DO UPDATE",
			"the insert must wait for the conflicting writer rather than reporting no inserted row")
		assert.Contains(t, contactInsertQuery, "RETURNING id",
			"the surviving contact id must be returned by the insert itself")
	})

	t.Run("rolls back when the conflicting insert fails", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(contactByEmailQuery).
			WithArgs("visitor@example.com").
			WillReturnError(pgx.ErrNoRows)
		mock.ExpectQuery(contactInsertQuery).
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnError(errors.New("connection refused"))
		mock.ExpectRollback()

		messageID, err := persistence.CreateMessage(context.Background(), newMessageSubmission(nil))

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Empty(t, messageID)
	})
}

// TestPostgresPersistenceLayerCreateMessageServerSideFields tests that the read
// flag and the submission timestamp are generated by this layer rather than
// taken from the client, and that the insert is schema qualified and covers
// every server side column (REQ-5.5, [GO-041]).
func TestPostgresPersistenceLayerCreateMessageServerSideFields(t *testing.T) {
	t.Run("persists read as false and a server side utc submitted_at", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		insertedRead := &capturedArg{}
		insertedSubmittedAt := &capturedArg{}

		mock.ExpectBegin()
		mock.ExpectQuery(contactByEmailQuery).
			WithArgs("visitor@example.com").
			WillReturnRows(pgxmock.NewRows([]string{"id"}).AddRow("existing-contact-id"))
		mock.ExpectExec(messageInsertQuery).
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), insertedRead, insertedSubmittedAt).
			WillReturnResult(pgxmock.NewResult("INSERT", 1))
		mock.ExpectCommit()

		before := time.Now().UTC()
		_, err := persistence.CreateMessage(context.Background(), newMessageSubmission(nil))
		after := time.Now().UTC()

		require.NoError(t, err)
		assert.Equal(t, false, insertedRead.value, "new messages must always be persisted as unread")

		submittedAt, ok := insertedSubmittedAt.value.(time.Time)
		require.True(t, ok, "submitted_at must be persisted as a timestamp")
		assert.Equal(t, time.UTC, submittedAt.Location(), "submitted_at must be a UTC timestamp")
		assert.False(t, submittedAt.Before(before), "submitted_at must be the server side receipt time")
		assert.False(t, submittedAt.After(after), "submitted_at must be the server side receipt time")
	})

	t.Run("issues a schema qualified insert covering every server side column", func(t *testing.T) {
		cases := []struct {
			name   string
			clause string
		}{
			{"writes to the schema qualified message table", "INSERT INTO base.message"},
			{"writes the generated id and resolved contact id", "(id, contact_id"},
			{"writes the read flag and the submission timestamp", `"read", submitted_at)`},
			{"parameterizes every value", "VALUES ($1, $2, $3, $4, $5)"},
		}

		for _, testCase := range cases {
			t.Run(testCase.name, func(t *testing.T) {
				assert.Contains(t, messageInsertQuery, testCase.clause)
			})
		}
	})
}

// TestPostgresPersistenceLayerCreateMessageFailures tests every failure path of
// the message write: a failing message insert, contact insert and contact lookup
// each roll the transaction back without committing, and a transaction that
// cannot be started or committed is reported to the caller ([GO-036]).
func TestPostgresPersistenceLayerCreateMessageFailures(t *testing.T) {
	// A failing message insert must roll the whole transaction back so that the
	// contact created moments earlier never survives on its own (REQ-5.4).
	t.Run("rolls back without committing when the message insert fails", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(contactByEmailQuery).
			WithArgs("visitor@example.com").
			WillReturnError(pgx.ErrNoRows)
		mock.ExpectQuery(contactInsertQuery).
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnRows(pgxmock.NewRows([]string{"id"}).AddRow("inserted-contact-id"))
		mock.ExpectExec(messageInsertQuery).
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnError(errors.New("constraint violation"))
		// No commit is registered: the rollback below is the only permitted
		// end of the transaction.
		mock.ExpectRollback()

		messageID, err := persistence.CreateMessage(context.Background(), newMessageSubmission(nil))

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Empty(t, messageID)
	})

	t.Run("rolls back when the contact insert fails", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(contactByEmailQuery).
			WithArgs("visitor@example.com").
			WillReturnError(pgx.ErrNoRows)
		mock.ExpectQuery(contactInsertQuery).
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnError(errors.New("connection refused"))
		mock.ExpectRollback()

		messageID, err := persistence.CreateMessage(context.Background(), newMessageSubmission(nil))

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Empty(t, messageID)
	})

	t.Run("rolls back when the contact lookup fails", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(contactByEmailQuery).
			WithArgs("visitor@example.com").
			WillReturnError(errors.New("connection refused"))
		mock.ExpectRollback()

		messageID, err := persistence.CreateMessage(context.Background(), newMessageSubmission(nil))

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Empty(t, messageID)
	})

	t.Run("returns an error when the transaction cannot be started", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin().WillReturnError(errors.New("connection refused"))

		messageID, err := persistence.CreateMessage(context.Background(), newMessageSubmission(nil))

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Empty(t, messageID)
	})

	t.Run("returns an error when the transaction cannot be committed", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectBegin()
		mock.ExpectQuery(contactByEmailQuery).
			WithArgs("visitor@example.com").
			WillReturnRows(pgxmock.NewRows([]string{"id"}).AddRow("existing-contact-id"))
		mock.ExpectExec(messageInsertQuery).
			WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
			WillReturnResult(pgxmock.NewResult("INSERT", 1))
		mock.ExpectCommit().WillReturnError(errors.New("connection refused"))

		messageID, err := persistence.CreateMessage(context.Background(), newMessageSubmission(nil))

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Empty(t, messageID)
	})
}
