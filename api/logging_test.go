package main

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"

	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
)

// captureLog configures the shared logger from the given configuration, redirects
// its output into a buffer, invokes emit and returns the captured output. The
// logger output is restored to stdout before returning so that tests remain
// independent of one another.
func captureLog(t *testing.T, cfg Config, emit func(entry *logrus.Logger)) string {
	t.Helper()

	logger := ConfigureLogger(cfg)
	buf := &bytes.Buffer{}
	logger.SetOutput(buf)
	t.Cleanup(func() { logger.SetOutput(os.Stdout) })

	emit(logger)
	return buf.String()
}

// TestConfigureLogger tests the configuration of the shared logger: entries are
// emitted as JSON with the expected fields, the configured level is applied, and
// an unknown or empty level falls back to info ([GO-033], [LOG-002]).
func TestConfigureLogger(t *testing.T) {
	t.Run("emits entries as json with the expected fields", func(t *testing.T) {
		out := captureLog(t, Config{LogLevel: "info"}, func(logger *logrus.Logger) {
			logger.WithField("username", "TEST_USER_1").Info("received request to get user")
		})

		entry := map[string]any{}
		assert.NoError(t, json.Unmarshal([]byte(out), &entry))
		assert.Equal(t, "received request to get user", entry["msg"])
		assert.Equal(t, "info", entry["level"])
		assert.Equal(t, "TEST_USER_1", entry["username"])
		assert.Contains(t, entry, "time")
	})

	t.Run("applies the configured log level", func(t *testing.T) {
		logger := ConfigureLogger(Config{LogLevel: "warn"})
		assert.Equal(t, logrus.WarnLevel, logger.GetLevel())

		out := captureLog(t, Config{LogLevel: "warn"}, func(logger *logrus.Logger) {
			logger.Info("suppressed")
			logger.Warn("emitted")
		})

		assert.NotContains(t, out, "suppressed")
		assert.Contains(t, out, "emitted")
	})

	t.Run("falls back to info for an unknown log level", func(t *testing.T) {
		logger := ConfigureLogger(Config{LogLevel: "not-a-level"})
		assert.Equal(t, logrus.InfoLevel, logger.GetLevel())
	})

	t.Run("falls back to info for an empty log level", func(t *testing.T) {
		logger := ConfigureLogger(Config{})
		assert.Equal(t, logrus.InfoLevel, logger.GetLevel())
	})

	t.Run("returns the shared logger", func(t *testing.T) {
		assert.Same(t, Logger(), ConfigureLogger(Config{LogLevel: "debug"}))
	})
}

// TestLogger tests that the package level accessor returns one and the same
// logger on every call, configured with the JSON formatter ([GO-033]).
func TestLogger(t *testing.T) {
	t.Run("returns the same logger on every call", func(t *testing.T) {
		assert.NotNil(t, Logger())
		assert.Same(t, Logger(), Logger())
	})

	t.Run("uses the json formatter", func(t *testing.T) {
		assert.IsType(t, &logrus.JSONFormatter{}, Logger().Formatter)
	})
}

// TestNewLogger tests that the constructor returns a new logger on every call,
// configured with the JSON formatter, stdout as its output and the default
// level ([GO-033]).
func TestNewLogger(t *testing.T) {
	t.Run("configures the json formatter, stdout and the default level", func(t *testing.T) {
		logger := newLogger()

		assert.IsType(t, &logrus.JSONFormatter{}, logger.Formatter)
		assert.Equal(t, os.Stdout, logger.Out)
		assert.Equal(t, logrus.InfoLevel, logger.GetLevel())
	})

	t.Run("returns a new logger on every call", func(t *testing.T) {
		assert.NotSame(t, newLogger(), newLogger())
	})
}

// TestParseLogLevel tests the mapping of the configured log level string onto a
// logrus level, covering every supported level and the info fallback applied to
// an unrecognized one.
func TestParseLogLevel(t *testing.T) {
	t.Run("parses every supported level", func(t *testing.T) {
		levels := map[string]logrus.Level{
			"debug": logrus.DebugLevel,
			"info":  logrus.InfoLevel,
			"warn":  logrus.WarnLevel,
			"error": logrus.ErrorLevel,
			"INFO":  logrus.InfoLevel,
			" warn": logrus.WarnLevel,
		}

		for level, expected := range levels {
			assert.Equal(t, expected, parseLogLevel(level), "level %q", level)
		}
	})

	t.Run("defaults to info for unknown levels", func(t *testing.T) {
		assert.Equal(t, logrus.InfoLevel, parseLogLevel(""))
		assert.Equal(t, logrus.InfoLevel, parseLogLevel("not-a-level"))
	})
}
