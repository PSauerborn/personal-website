package main

import (
	"net/http"
	"os"
	"syscall"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// TestNewHTTPServer tests that the constructed server listens on the host and
// port taken from the configuration.
func TestNewHTTPServer(t *testing.T) {
	t.Run("server listens on the configured host and port", func(t *testing.T) {
		cfg := Config{ListenHost: "127.0.0.1", ListenPort: 10345}
		handler := http.NewServeMux()

		server := newHTTPServer(cfg, handler)

		assert.Equal(t, "127.0.0.1:10345", server.Addr)
		assert.Equal(t, handler, server.Handler)
		assert.Positive(t, server.ReadHeaderTimeout)
	})
}

// TestServe tests both paths through the serve loop: a shutdown signal stops the
// server gracefully, and a listen failure is returned to the caller rather than
// panicking ([GO-015]).
func TestServe(t *testing.T) {
	t.Run("shutdown signal stops the server", func(t *testing.T) {
		server := newHTTPServer(Config{ListenHost: "127.0.0.1", ListenPort: 0}, http.NewServeMux())

		signals := make(chan os.Signal, 1)
		signals <- syscall.SIGTERM

		done := make(chan error, 1)
		go func() { done <- serve(server, signals) }()

		select {
		case err := <-done:
			assert.NoError(t, err)
		case <-time.After(5 * time.Second):
			t.Fatal("serve did not return after shutdown signal")
		}

		// a server that has been shut down refuses to serve again, which
		// confirms that Shutdown was called rather than the goroutine simply
		// exiting
		assert.ErrorIs(t, server.ListenAndServe(), http.ErrServerClosed)
	})

	t.Run("listen error is returned", func(t *testing.T) {
		server := newHTTPServer(Config{ListenHost: "127.0.0.1", ListenPort: 1}, http.NewServeMux())
		server.Addr = "127.0.0.1:not-a-port"

		err := serve(server, make(chan os.Signal, 1))

		assert.Error(t, err)
	})
}
