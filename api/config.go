package main

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/go-playground/validator/v10"
	"github.com/spf13/viper"
)

// Config holds every setting required to run the API. Values are sourced from
// config.yaml and overridden by their corresponding environment variables, and
// each field is validated at startup ([GO-020], [GO-022]).
type Config struct {
	// Version is the API version string served verbatim by GET /v1/version.
	Version string `validate:"required"`
	// ListenHost is the address the HTTP server binds to.
	ListenHost string `validate:"required,ip"`
	// ListenPort is the TCP port the HTTP server binds to.
	ListenPort int `validate:"required,min=1,max=65535"`
	// LogLevel is the lowest log level that is emitted.
	LogLevel string `validate:"required,oneof=debug info warn error"`
	// PostgresHost is the hostname of the PostgreSQL server.
	PostgresHost string `validate:"required"`
	// PostgresPort is the port of the PostgreSQL server.
	PostgresPort int `validate:"required,min=1,max=65535"`
	// PostgresUser is the role used to connect to PostgreSQL.
	PostgresUser string `validate:"required"`
	// PostgresPassword is the password of the PostgreSQL role. It is a secret
	// and therefore has no default in config.yaml ([GO-019]).
	PostgresPassword string `validate:"required"`
	// PostgresDatabase is the name of the PostgreSQL database.
	PostgresDatabase string `validate:"required"`
	// PostgresSSLMode is the libpq sslmode used for the connection.
	PostgresSSLMode string `validate:"required,oneof=disable allow prefer require verify-ca verify-full"`

	// The settings below size and bound the shared pgx connection pool. Every
	// endpoint of this API is anonymous, so a traffic burst translates directly
	// into concurrent queries; leaving the pool on the driver defaults would let
	// a single instance open as many connections as PostgreSQL will accept and
	// leave a request waiting on an unreachable server for as long as the client
	// is willing to wait (RISK-018).

	// PostgresPoolMaxConnections is the largest number of connections the pool
	// opens. It is capped so that a misconfiguration cannot exhaust the
	// max_connections budget of the server.
	PostgresPoolMaxConnections int `validate:"required,min=1,max=1000"`
	// PostgresPoolConnectTimeoutSeconds bounds how long establishing a single
	// new connection may take before it is abandoned.
	PostgresPoolConnectTimeoutSeconds int `validate:"required,min=1,max=300"`
	// PostgresPoolMaxConnectionLifetimeSeconds is the age at which a connection
	// is retired, so that connections are recycled rather than held forever.
	PostgresPoolMaxConnectionLifetimeSeconds int `validate:"required,min=1"`
	// PostgresPoolMaxConnectionIdleTimeSeconds is the idle period after which a
	// connection is closed, so that an idle instance releases server resources.
	PostgresPoolMaxConnectionIdleTimeSeconds int `validate:"required,min=1"`
}

// Validate validates the configuration using the validator package and returns
// an error describing every field that failed validation, or nil when the
// configuration is valid.
func (c Config) Validate() error {
	validate := validator.New(validator.WithRequiredStructEnabled())
	return validate.Struct(c)
}

// PostgresDSN returns the PostgreSQL connection string described by the
// configuration, with the user and password percent-encoded so that values
// containing reserved characters remain valid.
func (c Config) PostgresDSN() string {
	dsn := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(c.PostgresUser, c.PostgresPassword),
		Host:     c.PostgresHost + ":" + strconv.Itoa(c.PostgresPort),
		Path:     "/" + c.PostgresDatabase,
		RawQuery: url.Values{"sslmode": []string{c.PostgresSSLMode}}.Encode(),
	}
	return dsn.String()
}

// LoadConfig loads the application configuration from environment variables
// first and from config.yaml second, so that environment variables take
// precedence over the committed defaults ([GO-024]). It returns the populated
// and validated configuration, or an error wrapping ErrInvalidConfig when the
// configuration file cannot be read or a field fails validation. It never
// panics or exits ([GO-015]).
func LoadConfig() (*Config, error) {
	// a dedicated viper instance is used rather than the package-level
	// singleton so that repeated loads never share mutable global state
	v := viper.New()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// load environment variables BEFORE reading the yaml config file
	v.AutomaticEnv()

	v.AddConfigPath(".")
	v.AddConfigPath("etc")
	v.SetConfigType("yaml")
	v.SetConfigName("config")

	if err := v.ReadInConfig(); err != nil {
		// a missing config file is tolerated: every non-secret value can also
		// be supplied through the environment
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("%w: unable to read config file: %w", ErrInvalidConfig, err)
		}
	}

	cfg := &Config{
		Version:          v.GetString("api.version"),
		ListenHost:       v.GetString("listen.host"),
		ListenPort:       v.GetInt("listen.port"),
		LogLevel:         v.GetString("log.level"),
		PostgresHost:     v.GetString("postgres.host"),
		PostgresPort:     v.GetInt("postgres.port"),
		PostgresUser:     v.GetString("postgres.user"),
		PostgresPassword: v.GetString("postgres.password"),
		PostgresDatabase: v.GetString("postgres.db"),
		PostgresSSLMode:  v.GetString("postgres.ssl.mode"),

		PostgresPoolMaxConnections:               v.GetInt("postgres.pool.max_connections"),
		PostgresPoolConnectTimeoutSeconds:        v.GetInt("postgres.pool.connect_timeout_seconds"),
		PostgresPoolMaxConnectionLifetimeSeconds: v.GetInt("postgres.pool.max_connection_lifetime_seconds"),
		PostgresPoolMaxConnectionIdleTimeSeconds: v.GetInt("postgres.pool.max_connection_idle_time_seconds"),
	}

	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidConfig, err)
	}
	return cfg, nil
}
