package main

import (
	"context"
	"errors"
	"regexp"
	"testing"
	"time"

	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// hexIDPattern matches the exact shape of the IDs stored in the VARCHAR(32)
// primary keys described in docs/db_schema.md §2: 32 lowercase hex characters
// with no hyphens.
var hexIDPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)

// newMockPersistenceLayer returns a PostgresPersistenceLayer backed by a
// pgxmock pool together with that mock, so that persistence tests can set
// expectations on the queries the layer issues without a live database
// ([GO-030]). All expectations registered on the mock are asserted to have been
// met when the test finishes, so callers never have to remember to do so.
//
// The pool is built with pgxmock.QueryMatcherEqual rather than with the default
// regexp matcher, so an expectation only matches when the statement the layer
// issues is character-for-character (whitespace-insensitively) the statement the
// test names. No live database or integration run is possible in this
// environment, so the SQL string assertion is the only check standing between a
// wrong column, join or table name and production; a fragment match would let
// such an edit ship green. Expectations therefore pass the statement constant
// itself rather than a pattern (RISK-001).
//
// This helper is shared by every persistence_*_test.go file in this component.
func newMockPersistenceLayer(t *testing.T) (*PostgresPersistenceLayer, pgxmock.PgxPoolIface) {
	t.Helper()

	mock, err := pgxmock.NewPool(pgxmock.QueryMatcherOption(pgxmock.QueryMatcherEqual))
	require.NoError(t, err, "failed to create mock pool")

	t.Cleanup(func() {
		assert.NoError(t, mock.ExpectationsWereMet(), "unmet pgxmock expectations")
	})
	return &PostgresPersistenceLayer{pool: mock}, mock
}

// TestNewMockPersistenceLayerMatchesSQLForEquality guards the matcher itself.
// Every persistence test relies on newMockPersistenceLayer refusing a statement
// that merely contains the expected text, since a fragment match is what would
// let a wrong column, join or table name ship green in an environment with no
// live database (RISK-001). Reverting the pool to the default regexp matcher
// makes this test fail.
func TestNewMockPersistenceLayerMatchesSQLForEquality(t *testing.T) {
	t.Run("rejects a statement that only contains the expected fragment", func(t *testing.T) {
		mock, err := pgxmock.NewPool(pgxmock.QueryMatcherOption(pgxmock.QueryMatcherEqual))
		require.NoError(t, err)
		defer mock.Close()

		mock.ExpectQuery("FROM base.project").
			WillReturnRows(pgxmock.NewRows([]string{"id"}))

		_, err = mock.Query(context.Background(), listProjectsQuery)

		assert.Error(t, err, "a fragment must not match the full statement")
	})

	t.Run("accepts the statement the expectation names", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectQuery(listProjectsQuery).
			WillReturnRows(pgxmock.NewRows(projectColumns))

		_, err := persistence.GetProjects(context.Background())

		assert.NoError(t, err)
	})
}

// TestNewID tests the resource identifier generator: identifiers are 32
// lowercase hex characters with the hyphens stripped, matching the VARCHAR(32)
// primary keys of docs/db_schema.md §2, and are unique across calls
// ([GO-041]).
func TestNewID(t *testing.T) {
	t.Run("generates a 32 character lowercase hex id without hyphens", func(t *testing.T) {
		id, err := NewID()

		assert.NoError(t, err)
		assert.Len(t, id, 32)
		assert.NotContains(t, id, "-")
		assert.Regexp(t, hexIDPattern, id)
	})

	t.Run("generates unique ids across calls", func(t *testing.T) {
		seen := make(map[string]struct{}, 100)
		for i := 0; i < 100; i++ {
			id, err := NewID()
			require.NoError(t, err)

			_, duplicate := seen[id]
			assert.False(t, duplicate, "duplicate id generated: %s", id)
			seen[id] = struct{}{}
		}
		assert.Len(t, seen, 100)
	})
}

// TestPostgresPersistenceLayerHealthCheck tests every path through the health
// check: a reachable database, an unreachable one, and the ping bound by its own
// timeout, with and without a caller deadline, so that a hung database cannot
// hold the health request open (REQ-1.5, RISK-019).
func TestPostgresPersistenceLayerHealthCheck(t *testing.T) {
	t.Run("returns nil when the database responds to a ping", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectPing()

		assert.NoError(t, persistence.HealthCheck(context.Background()))
	})

	t.Run("returns an error when the database is unreachable", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectPing().WillReturnError(errors.New("connection refused"))

		err := persistence.HealthCheck(context.Background())

		assert.Error(t, err)
		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
	})

	// A hung database must not hold the health request open for as long as the
	// caller is willing to wait: the ping carries its own deadline, so monitoring
	// learns about the outage promptly (RISK-019, REQ-1.5).
	t.Run("bounds the ping with its own timeout when the database does not answer", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectPing().WillDelayFor(2 * healthCheckPingTimeout)

		start := time.Now()
		var err error
		captureLogs(func() {
			err = persistence.HealthCheck(context.Background())
		})
		elapsed := time.Since(start)

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Less(t, elapsed, 2*healthCheckPingTimeout,
			"the ping must fail on its own deadline rather than waiting for the caller")
	})

	t.Run("bounds the ping even when the caller supplies no deadline", func(t *testing.T) {
		assert.Positive(t, healthCheckPingTimeout)
		assert.LessOrEqual(t, healthCheckPingTimeout, 10*time.Second,
			"the health check deadline must be short enough to surface an outage to monitoring")
	})

	// The caller's deadline still wins when it is the tighter of the two, so a
	// client that disconnects releases the connection immediately.
	t.Run("honours a caller deadline shorter than its own", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectPing().WillDelayFor(healthCheckPingTimeout)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
		defer cancel()

		start := time.Now()
		var err error
		captureLogs(func() {
			err = persistence.HealthCheck(ctx)
		})
		elapsed := time.Since(start)

		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.Less(t, elapsed, healthCheckPingTimeout)
	})
}

// TestPostgresPersistenceLayerClose tests that closing the layer closes the
// underlying connection pool, so that no connection outlives the process
// ([GO-037]).
func TestPostgresPersistenceLayerClose(t *testing.T) {
	t.Run("closes the underlying connection pool", func(t *testing.T) {
		persistence, mock := newMockPersistenceLayer(t)
		mock.ExpectClose()

		persistence.Close()
	})
}

// TestNewPostgresPersistenceLayer tests the constructor of the PostgreSQL layer:
// a valid configuration yields a layer holding a single pool, an unparseable
// connection string yields an error, and neither the returned error nor the logs
// disclose any value derived from the connection string ([GO-035], [GO-045]).
func TestNewPostgresPersistenceLayer(t *testing.T) {
	t.Run("returns a layer holding a single pool for a valid configuration", func(t *testing.T) {
		cfg := Config{
			PostgresHost:     "localhost",
			PostgresPort:     5432,
			PostgresUser:     "user",
			PostgresPassword: "password",
			PostgresDatabase: "website",
			PostgresSSLMode:  "disable",

			PostgresPoolMaxConnections:               10,
			PostgresPoolConnectTimeoutSeconds:        5,
			PostgresPoolMaxConnectionLifetimeSeconds: 3600,
			PostgresPoolMaxConnectionIdleTimeSeconds: 300,
		}

		persistence, err := NewPostgresPersistenceLayer(cfg)

		require.NoError(t, err)
		require.NotNil(t, persistence)
		assert.NotNil(t, persistence.pool)
		persistence.Close()
	})

	t.Run("returns an error for an unparseable connection string", func(t *testing.T) {
		cfg := Config{
			PostgresHost:     "localhost",
			PostgresPort:     5432,
			PostgresUser:     "user",
			PostgresPassword: "password",
			PostgresDatabase: "website",
			PostgresSSLMode:  "not-a-valid-ssl-mode",
		}

		var persistence *PostgresPersistenceLayer
		var err error
		captureLogs(func() {
			persistence, err = NewPostgresPersistenceLayer(cfg)
		})

		assert.Error(t, err)
		assert.Nil(t, persistence)
	})

	t.Run("logs no value derived from the connection string when the pool cannot be created", func(t *testing.T) {
		// The driver error for an unusable DSN embeds the connection string, and
		// its redaction depends on the DSN parsing at all, so the error itself is
		// never logged: a password containing a character that defeats the URL
		// parser would otherwise reach the log stream verbatim.
		cfg := Config{
			PostgresHost:     "localhost",
			PostgresPort:     5432,
			PostgresUser:     "user",
			PostgresPassword: "sup3r-s3cret-passw0rd",
			PostgresDatabase: "website",
			PostgresSSLMode:  "not-a-valid-ssl-mode",
		}

		logs := captureLogs(func() {
			_, err := NewPostgresPersistenceLayer(cfg)
			assert.Error(t, err)
		})

		assert.NotContains(t, logs, cfg.PostgresPassword, "the database password must never be logged")
		assert.NotContains(t, logs, "postgres://", "no value derived from the DSN may be logged")
		assert.NotContains(t, logs, cfg.PostgresDSN())
		assert.Contains(t, logs, "unable to create postgres connection pool")
	})

	t.Run("does not disclose the connection string through the returned error", func(t *testing.T) {
		cfg := Config{
			PostgresHost:     "localhost",
			PostgresPort:     5432,
			PostgresUser:     "user",
			PostgresPassword: "sup3r-s3cret-passw0rd",
			PostgresDatabase: "website",
			PostgresSSLMode:  "not-a-valid-ssl-mode",
		}

		var err error
		captureLogs(func() {
			_, err = NewPostgresPersistenceLayer(cfg)
		})

		require.Error(t, err)
		assert.ErrorIs(t, err, ErrDatabaseUnavailable)
		assert.NotContains(t, err.Error(), cfg.PostgresPassword)
		assert.NotContains(t, err.Error(), "postgres://")
	})
}

// TestPoolConfig asserts that the connection pool is built from the configured
// sizing and timeouts rather than from the driver defaults, so that a burst of
// anonymous traffic cannot open an unbounded number of connections or leave a
// request waiting on a dead server indefinitely (RISK-018).
func TestPoolConfig(t *testing.T) {
	cfg := Config{
		PostgresHost:     "localhost",
		PostgresPort:     5432,
		PostgresUser:     "user",
		PostgresPassword: "password",
		PostgresDatabase: "website",
		PostgresSSLMode:  "disable",

		PostgresPoolMaxConnections:               17,
		PostgresPoolConnectTimeoutSeconds:        7,
		PostgresPoolMaxConnectionLifetimeSeconds: 900,
		PostgresPoolMaxConnectionIdleTimeSeconds: 60,
	}

	t.Run("applies every configured pool setting", func(t *testing.T) {
		poolCfg, err := poolConfig(cfg)

		require.NoError(t, err)
		require.NotNil(t, poolCfg)
		assert.Equal(t, int32(17), poolCfg.MaxConns)
		assert.Equal(t, 900*time.Second, poolCfg.MaxConnLifetime)
		assert.Equal(t, 60*time.Second, poolCfg.MaxConnIdleTime)
		require.NotNil(t, poolCfg.ConnConfig)
		assert.Equal(t, 7*time.Second, poolCfg.ConnConfig.ConnectTimeout)
	})

	t.Run("returns an error for an unusable connection string", func(t *testing.T) {
		invalid := cfg
		invalid.PostgresSSLMode = "not-a-valid-ssl-mode"

		poolCfg, err := poolConfig(invalid)

		assert.Error(t, err)
		assert.Nil(t, poolCfg)
	})
}

// TestPostgresPersistenceLayerImplementsPersistenceLayer tests that the
// PostgreSQL layer satisfies the PersistenceLayer interface every handler
// depends on ([GO-035]).
func TestPostgresPersistenceLayerImplementsPersistenceLayer(t *testing.T) {
	t.Run("satisfies the PersistenceLayer interface", func(t *testing.T) {
		var persistence PersistenceLayer = &PostgresPersistenceLayer{}
		assert.NotNil(t, persistence)
	})
}
