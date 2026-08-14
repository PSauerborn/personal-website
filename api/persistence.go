package main

import (
	"context"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PgxPool is the subset of *pgxpool.Pool used by the persistence layer. The
// concrete pool is stored behind this interface so that unittests can inject a
// pgxmock pool in its place ([GO-030]); both *pgxpool.Pool and
// pgxmock.PgxPoolIface satisfy it.
type PgxPool interface {
	// Ping verifies that a connection to the database can be established.
	Ping(ctx context.Context) error
	// Close closes the pool and every connection it holds.
	Close()
	// Begin starts a transaction.
	Begin(ctx context.Context) (pgx.Tx, error)
	// Exec executes a statement that returns no rows.
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	// Query executes a statement that returns rows.
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	// QueryRow executes a statement that returns at most a single row.
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// PersistenceLayer is the storage contract for this component. Every handler
// depends on this interface rather than on a concrete implementation, so that
// storage logic stays behind a single seam ([GO-035], [GO-039]).
type PersistenceLayer interface {
	// HealthCheck reports whether the underlying database is reachable.
	HealthCheck(ctx context.Context) error
	// GetCVExperience returns every CV work experience entry as a complete
	// aggregate, ordered by start date descending (REQ-2.3, REQ-2.4).
	GetCVExperience(ctx context.Context) ([]CVExperience, error)
	// GetCVEducation returns every CV education entry, ordered by start date
	// descending (REQ-2.4).
	GetCVEducation(ctx context.Context) ([]CVEducation, error)
	// GetCVSkills returns the categorized tech stack items of the CV grouped by
	// category (REQ-2.6).
	GetCVSkills(ctx context.Context) (CVSkills, error)
	// GetProjects returns every project flagged for display, ordered by name;
	// projects with display = false are never returned (REQ-6.2).
	GetProjects(ctx context.Context) ([]Project, error)
	// GetSubagents returns the complete subagent catalogue, ordered by name,
	// with undeclared input and output schemas returned as empty maps (REQ-4.2).
	GetSubagents(ctx context.Context) ([]Subagent, error)
	// GetAgentSpecs returns the metadata of every spec flagged for display
	// together with all of its linked documents, restricted documents included
	// (REQ-4.3, REQ-4.4, REQ-4.7).
	GetAgentSpecs(ctx context.Context) ([]AgentSpec, error)
	// GetSpecDocument returns the content of the document with the given
	// document id provided it is linked to the given spec, and an error
	// wrapping ErrSpecDocumentNotFound when it is not (REQ-4.8).
	GetSpecDocument(ctx context.Context, specID, documentID string) (SpecDocument, error)
	// GetArticles returns the listing metadata of every publicly visible
	// article together with its topics, most recently authored first; hidden,
	// document-less and restricted-document articles are never listed (REQ-3.2).
	GetArticles(ctx context.Context) ([]Article, error)
	// GetArticleContent returns the raw content of the document linked to the
	// given article, and an error wrapping ErrArticleNotFound when the article
	// is not publicly visible (REQ-3.3).
	GetArticleContent(ctx context.Context, articleID string) ([]byte, error)
	// GetArticleComments returns every comment recorded against the given
	// article, oldest first, and an error wrapping ErrArticleNotFound when the
	// article is not publicly visible (REQ-3.4, REQ-3.7).
	GetArticleComments(ctx context.Context, articleID string) ([]ArticleComment, error)
	// CreateArticleComment records a new comment against the given article and
	// returns the identifier generated for it. A nil author is persisted as
	// SQL NULL. It returns an error wrapping ErrArticleNotFound when the
	// article is not publicly visible (REQ-3.5, REQ-3.7).
	CreateArticleComment(ctx context.Context, articleID string, author *string, comment string) (string, error)
	// CreateMessage records a contact form submission, creating the contact
	// identified by the submitted email address when it does not exist yet and
	// reusing it when it does, and returns the identifier generated for the
	// message. The contact and the message are written inside a single
	// transaction (REQ-5.2, REQ-5.4, REQ-5.5).
	CreateMessage(ctx context.Context, submission MessageSubmission) (string, error)
	// Close releases every resource held by the persistence layer.
	Close()
}

// PostgresPersistenceLayer is the PostgreSQL implementation of PersistenceLayer.
// It holds the single connection pool shared by the whole application; the pool
// is safe for concurrent use, which makes the layer itself thread-safe
// ([GO-038], [GO-045]).
type PostgresPersistenceLayer struct {
	pool PgxPool
}

// poolConfig builds the pgx pool configuration described by the given
// application configuration. It parses the connection string and then applies
// the configured sizing and timeouts on top of it, so that the pool is never
// left on the driver defaults: every endpoint of this API is anonymous, so a
// traffic burst turns straight into concurrent queries and an unbounded pool
// would exhaust the server's connection budget while an unbounded connect
// attempt would hold a request open against a dead server (RISK-018). It
// returns an error when the configured connection string cannot be parsed;
// that error embeds the connection string and must never be logged or
// returned to a caller.
func poolConfig(cfg Config) (*pgxpool.Config, error) {
	poolCfg, err := pgxpool.ParseConfig(cfg.PostgresDSN())
	if err != nil {
		return nil, err
	}

	poolCfg.MaxConns = int32(cfg.PostgresPoolMaxConnections)
	poolCfg.MaxConnLifetime = time.Duration(cfg.PostgresPoolMaxConnectionLifetimeSeconds) * time.Second
	poolCfg.MaxConnIdleTime = time.Duration(cfg.PostgresPoolMaxConnectionIdleTimeSeconds) * time.Second
	poolCfg.ConnConfig.ConnectTimeout = time.Duration(cfg.PostgresPoolConnectTimeoutSeconds) * time.Second

	return poolCfg, nil
}

// NewPostgresPersistenceLayer creates a new PostgresPersistenceLayer using the
// PostgreSQL connection settings held by the given configuration. It creates
// the connection pool exactly once, with the configured sizing and timeouts,
// and stores it on the returned layer ([GO-035], [GO-045]). It returns an error
// wrapping ErrDatabaseUnavailable when the configured connection string cannot
// be used to build a pool.
func NewPostgresPersistenceLayer(cfg Config) (*PostgresPersistenceLayer, error) {
	pool, err := newPool(cfg)
	if err != nil {
		// The driver error embeds the connection string, and whether the password
		// in it is redacted depends on the DSN parsing at all - a password that
		// defeats the URL parser is echoed verbatim - so the error is deliberately
		// not logged. Only the non-secret connection coordinates are recorded, as
		// explicit fields ([LOG-004]), which is what an operator needs to tell
		// which target failed.
		Logger().WithFields(map[string]any{
			"postgres_host":     cfg.PostgresHost,
			"postgres_port":     cfg.PostgresPort,
			"postgres_database": cfg.PostgresDatabase,
		}).Error("unable to create postgres connection pool")
		return nil, fmt.Errorf("%w: unable to create connection pool", ErrDatabaseUnavailable)
	}
	return &PostgresPersistenceLayer{pool: pool}, nil
}

// newPool builds the configured connection pool. It returns the driver error
// unchanged; the caller is responsible for never disclosing it, since it can
// embed the connection string.
func newPool(cfg Config) (*pgxpool.Pool, error) {
	poolCfg, err := poolConfig(cfg)
	if err != nil {
		return nil, err
	}
	return pgxpool.NewWithConfig(context.Background(), poolCfg)
}

// healthCheckPingTimeout bounds a single health-check ping. The health endpoint
// exists so that monitoring and the deployment gate learn about an unreachable
// database, which a ping inheriting only the caller's context defeats: a hung
// server would hold the health request open for as long as the client waits and
// report nothing (RISK-019).
const healthCheckPingTimeout = 2 * time.Second

// HealthCheck pings the database and returns nil when it is reachable, or an
// error wrapping ErrDatabaseUnavailable when it is not (REQ-1.5). The ping runs
// under its own deadline derived from the caller's context, so the tighter of
// the two bounds it: a hung database fails the check promptly, and a client that
// disconnects first still releases the connection immediately.
func (db *PostgresPersistenceLayer) HealthCheck(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, healthCheckPingTimeout)
	defer cancel()

	if err := db.pool.Ping(ctx); err != nil {
		Logger().WithError(err).Error("database health check failed")
		return fmt.Errorf("%w: ping failed", ErrDatabaseUnavailable)
	}
	return nil
}

// Close closes the underlying connection pool. It is called once during
// graceful shutdown so that no database connection outlives the process
// ([GO-037]).
func (db *PostgresPersistenceLayer) Close() {
	if db.pool == nil {
		return
	}
	db.pool.Close()
}

// runInTransaction executes the given unit of work inside a single database
// transaction, committing it when the work succeeds and rolling it back when it
// does not. It is the only transaction scaffolding of this component, so that
// the rollback, commit and error handling rules are stated once rather than
// once per persistence file ([GO-036]). Every operation that issues more than
// one statement and cannot be folded into a single one - the comment read and
// write, the message write and the CV experience read - runs through it. A
// committed transaction is never rolled back afterwards, since the driver
// answers the second termination with pgx.ErrTxClosed and would turn every
// successful read into a warning. Errors returned by the unit of work are
// propagated unchanged so that sentinels such as ErrArticleNotFound survive the
// round trip.
//
// The transaction runs at the isolation level the server defaults to, which is
// READ COMMITTED unless configured otherwise: it makes the statements of the
// unit of work atomic, not snapshot-consistent. Reads that must observe one
// snapshot are therefore written as a single statement instead.
func runInTransaction(ctx context.Context, pool PgxPool, work func(tx pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		Logger().WithError(err).Error("unable to begin transaction")
		return fmt.Errorf("%w: unable to begin transaction", ErrDatabaseUnavailable)
	}
	committed := false
	defer func() {
		if committed {
			return
		}
		if err := tx.Rollback(ctx); err != nil {
			Logger().WithError(err).Warn("unable to roll back transaction")
		}
	}()

	if err := work(tx); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		Logger().WithError(err).Error("unable to commit transaction")
		return fmt.Errorf("%w: unable to commit transaction", ErrDatabaseUnavailable)
	}
	committed = true
	return nil
}

// NewID returns a new resource identifier as a UUIDv7 rendered as 32 lowercase
// hex characters with the hyphens stripped, matching the VARCHAR(32) primary
// keys defined in docs/db_schema.md §2. It returns an error wrapping
// ErrIDGeneration when the underlying random source fails. IDs are generated
// here rather than in the application layer ([GO-041]).
func NewID() (string, error) {
	id, err := uuid.NewV7()
	if err != nil {
		Logger().WithError(err).Error("unable to generate uuidv7")
		return "", fmt.Errorf("%w: %w", ErrIDGeneration, err)
	}
	return hex.EncodeToString(id[:]), nil
}
