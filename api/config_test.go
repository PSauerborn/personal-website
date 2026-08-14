package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setRequiredEnv sets the environment variables that have no default in
// config.yaml so that a load succeeds unless the test under way deliberately
// invalidates one of them.
func setRequiredEnv(t *testing.T) {
	t.Helper()
	t.Setenv("POSTGRES_PASSWORD", "s3cret")
}

// TestLoadConfig tests every path through the configuration loader: the
// defaults committed to config.yaml, the environment variables that override
// them, and the validation errors returned for a missing or invalid field
// ([GO-018], [GO-020], [GO-024]).
func TestLoadConfig(t *testing.T) {
	t.Run("defaults are loaded from config.yaml", func(t *testing.T) {
		setRequiredEnv(t)

		cfg, err := LoadConfig()
		require.NoError(t, err)
		require.NotNil(t, cfg)

		assert.Equal(t, "v1", cfg.Version)
		assert.Equal(t, "0.0.0.0", cfg.ListenHost)
		assert.Equal(t, 10000, cfg.ListenPort)
		assert.Equal(t, "info", cfg.LogLevel)
		assert.Equal(t, "localhost", cfg.PostgresHost)
		assert.Equal(t, 5432, cfg.PostgresPort)
		assert.Equal(t, "postgres", cfg.PostgresUser)
		assert.Equal(t, "postgres", cfg.PostgresDatabase)
		assert.Equal(t, "disable", cfg.PostgresSSLMode)
		assert.Equal(t, "s3cret", cfg.PostgresPassword)
	})

	// The connection pool is sized and bounded through configuration rather than
	// left on the driver defaults, so that an operator can cap the connections a
	// single instance opens and the time a request may spend waiting for one
	// (RISK-018).
	t.Run("pool defaults are loaded from config.yaml", func(t *testing.T) {
		setRequiredEnv(t)

		cfg, err := LoadConfig()
		require.NoError(t, err)
		require.NotNil(t, cfg)

		assert.Equal(t, 10, cfg.PostgresPoolMaxConnections)
		assert.Equal(t, 5, cfg.PostgresPoolConnectTimeoutSeconds)
		assert.Equal(t, 3600, cfg.PostgresPoolMaxConnectionLifetimeSeconds)
		assert.Equal(t, 300, cfg.PostgresPoolMaxConnectionIdleTimeSeconds)
	})

	t.Run("environment variables override the pool defaults", func(t *testing.T) {
		setRequiredEnv(t)

		t.Setenv("POSTGRES_POOL_MAX_CONNECTIONS", "42")
		t.Setenv("POSTGRES_POOL_CONNECT_TIMEOUT_SECONDS", "9")
		t.Setenv("POSTGRES_POOL_MAX_CONNECTION_LIFETIME_SECONDS", "120")
		t.Setenv("POSTGRES_POOL_MAX_CONNECTION_IDLE_TIME_SECONDS", "30")

		cfg, err := LoadConfig()
		require.NoError(t, err)
		require.NotNil(t, cfg)

		assert.Equal(t, 42, cfg.PostgresPoolMaxConnections)
		assert.Equal(t, 9, cfg.PostgresPoolConnectTimeoutSeconds)
		assert.Equal(t, 120, cfg.PostgresPoolMaxConnectionLifetimeSeconds)
		assert.Equal(t, 30, cfg.PostgresPoolMaxConnectionIdleTimeSeconds)
	})

	t.Run("an out of range pool size returns a validation error", func(t *testing.T) {
		setRequiredEnv(t)
		t.Setenv("POSTGRES_POOL_MAX_CONNECTIONS", "0")

		cfg, err := LoadConfig()
		assert.Nil(t, cfg)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrInvalidConfig)
		assert.Contains(t, err.Error(), "PostgresPoolMaxConnections")
	})

	t.Run("environment variables override config.yaml values", func(t *testing.T) {
		setRequiredEnv(t)

		t.Setenv("API_VERSION", "v2")
		t.Setenv("LISTEN_HOST", "127.0.0.1")
		t.Setenv("LISTEN_PORT", "8080")
		t.Setenv("LOG_LEVEL", "debug")
		t.Setenv("POSTGRES_HOST", "db.internal")
		t.Setenv("POSTGRES_PORT", "6543")
		t.Setenv("POSTGRES_USER", "admin")
		t.Setenv("POSTGRES_DB", "personal_website")
		t.Setenv("POSTGRES_SSL_MODE", "require")

		cfg, err := LoadConfig()
		require.NoError(t, err)
		require.NotNil(t, cfg)

		assert.Equal(t, "v2", cfg.Version)
		assert.Equal(t, "127.0.0.1", cfg.ListenHost)
		assert.Equal(t, 8080, cfg.ListenPort)
		assert.Equal(t, "debug", cfg.LogLevel)
		assert.Equal(t, "db.internal", cfg.PostgresHost)
		assert.Equal(t, 6543, cfg.PostgresPort)
		assert.Equal(t, "admin", cfg.PostgresUser)
		assert.Equal(t, "personal_website", cfg.PostgresDatabase)
		assert.Equal(t, "require", cfg.PostgresSSLMode)
	})

	t.Run("missing required field returns a validation error", func(t *testing.T) {
		// POSTGRES_PASSWORD has no default in config.yaml since it is a secret
		t.Setenv("POSTGRES_PASSWORD", "")

		cfg, err := LoadConfig()
		assert.Nil(t, cfg)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrInvalidConfig)
		assert.Contains(t, err.Error(), "PostgresPassword")
	})

	t.Run("invalid required field returns a validation error", func(t *testing.T) {
		setRequiredEnv(t)
		t.Setenv("LOG_LEVEL", "not-a-log-level")

		cfg, err := LoadConfig()
		assert.Nil(t, cfg)
		require.Error(t, err)
		assert.ErrorIs(t, err, ErrInvalidConfig)
		assert.Contains(t, err.Error(), "LogLevel")
	})
}

// TestConfigValidate tests the validation rules declared on Config, covering a
// fully populated configuration as well as one failure per rule kind: a missing
// required field, an out of range port and an unknown enum value ([GO-022]).
func TestConfigValidate(t *testing.T) {
	valid := Config{
		Version:          "v1",
		ListenHost:       "0.0.0.0",
		ListenPort:       10000,
		LogLevel:         "info",
		PostgresHost:     "localhost",
		PostgresPort:     5432,
		PostgresUser:     "postgres",
		PostgresPassword: "s3cret",
		PostgresDatabase: "postgres",
		PostgresSSLMode:  "disable",

		PostgresPoolMaxConnections:               10,
		PostgresPoolConnectTimeoutSeconds:        5,
		PostgresPoolMaxConnectionLifetimeSeconds: 3600,
		PostgresPoolMaxConnectionIdleTimeSeconds: 300,
	}

	t.Run("valid config passes validation", func(t *testing.T) {
		assert.NoError(t, valid.Validate())
	})

	t.Run("missing version fails validation", func(t *testing.T) {
		cfg := valid
		cfg.Version = ""

		err := cfg.Validate()
		require.Error(t, err)
		assert.Contains(t, err.Error(), "Version")
	})

	t.Run("out of range port fails validation", func(t *testing.T) {
		cfg := valid
		cfg.ListenPort = 70000

		err := cfg.Validate()
		require.Error(t, err)
		assert.Contains(t, err.Error(), "ListenPort")
	})

	t.Run("unknown ssl mode fails validation", func(t *testing.T) {
		cfg := valid
		cfg.PostgresSSLMode = "sometimes"

		err := cfg.Validate()
		require.Error(t, err)
		assert.Contains(t, err.Error(), "PostgresSSLMode")
	})

	t.Run("every pool setting is validated", func(t *testing.T) {
		cases := []struct {
			name     string
			mutate   func(*Config)
			expected string
		}{
			{"a pool of no connections", func(c *Config) { c.PostgresPoolMaxConnections = 0 }, "PostgresPoolMaxConnections"},
			{"an unbounded pool", func(c *Config) { c.PostgresPoolMaxConnections = 10_000 }, "PostgresPoolMaxConnections"},
			{"a zero connect timeout", func(c *Config) { c.PostgresPoolConnectTimeoutSeconds = 0 }, "PostgresPoolConnectTimeoutSeconds"},
			{"an unbounded connect timeout", func(c *Config) { c.PostgresPoolConnectTimeoutSeconds = 3_600 }, "PostgresPoolConnectTimeoutSeconds"},
			{"a zero connection lifetime", func(c *Config) { c.PostgresPoolMaxConnectionLifetimeSeconds = 0 }, "PostgresPoolMaxConnectionLifetimeSeconds"},
			{"a zero connection idle time", func(c *Config) { c.PostgresPoolMaxConnectionIdleTimeSeconds = 0 }, "PostgresPoolMaxConnectionIdleTimeSeconds"},
		}

		for _, testCase := range cases {
			t.Run(testCase.name, func(t *testing.T) {
				cfg := valid
				testCase.mutate(&cfg)

				err := cfg.Validate()
				require.Error(t, err)
				assert.Contains(t, err.Error(), testCase.expected)
			})
		}
	})
}

// TestConfigPostgresDSN tests the connection string rendered from the
// configuration, both for ordinary credentials and for credentials containing
// reserved characters that must be percent-encoded to keep the DSN valid.
func TestConfigPostgresDSN(t *testing.T) {
	t.Run("renders a valid connection string", func(t *testing.T) {
		cfg := Config{
			PostgresHost:     "db.internal",
			PostgresPort:     5432,
			PostgresUser:     "admin",
			PostgresPassword: "s3cret",
			PostgresDatabase: "personal_website",
			PostgresSSLMode:  "require",
		}

		expected := "postgres://admin:s3cret@db.internal:5432/personal_website?sslmode=require"
		assert.Equal(t, expected, cfg.PostgresDSN())
	})

	t.Run("escapes credentials containing reserved characters", func(t *testing.T) {
		cfg := Config{
			PostgresHost:     "localhost",
			PostgresPort:     5432,
			PostgresUser:     "admin",
			PostgresPassword: "p@ss/word",
			PostgresDatabase: "postgres",
			PostgresSSLMode:  "disable",
		}

		expected := "postgres://admin:p%40ss%2Fword@localhost:5432/postgres?sslmode=disable"
		assert.Equal(t, expected, cfg.PostgresDSN())
	})
}
