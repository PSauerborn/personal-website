package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

const (
	// shutdownTimeout is the time graceful shutdown waits for in-flight requests
	// to finish before their connections are closed forcibly.
	shutdownTimeout = 10 * time.Second
	// readHeaderTimeout bounds the time a client may take to send its request
	// headers, so that idle connections cannot be held open indefinitely.
	readHeaderTimeout = 10 * time.Second
)

// main is the entrypoint of the API. It loads and validates the configuration,
// configures the shared logger, creates the persistence layer and the router,
// and serves requests until a SIGINT or SIGTERM triggers graceful shutdown.
// It contains wiring only: every piece of behaviour lives in the constructors
// it calls.
func main() {
	cfg, err := LoadConfig()
	if err != nil {
		// the logger is still at its default level here, which is sufficient to
		// report why startup was aborted ([GO-020])
		Logger().WithError(err).Fatal("unable to load application configuration")
	}

	log := ConfigureLogger(*cfg)

	db, err := NewPostgresPersistenceLayer(*cfg)
	if err != nil {
		log.WithError(err).Fatal("unable to create persistence layer")
	}
	// the pool is closed after the HTTP server has stopped accepting
	// connections, so that no in-flight request loses its database access
	// ([GO-037])
	defer db.Close()

	server := newHTTPServer(*cfg, NewRouter(NewController(db, *cfg)))

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)

	log.WithField("address", server.Addr).Info("starting api server")
	if err := serve(server, signals); err != nil {
		// returning instead of exiting lets the deferred pool close run
		log.WithError(err).Error("api server terminated unexpectedly")
		return
	}

	log.Info("api server stopped")
}

// newHTTPServer returns the HTTP server of this API. The cfg argument supplies
// the host and port the server binds to and the handler argument is the router
// serving every request.
func newHTTPServer(cfg Config, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              net.JoinHostPort(cfg.ListenHost, strconv.Itoa(cfg.ListenPort)),
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
	}
}

// serve serves requests with the given server until a signal is received on the
// given channel, and then shuts the server down gracefully. It returns nil once
// the server has stopped, or an error when the server could not be started or
// could not be shut down within shutdownTimeout.
func serve(server *http.Server, signals <-chan os.Signal) error {
	errs := make(chan error, 1)
	go func() {
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errs <- err
		}
	}()

	select {
	case err := <-errs:
		return fmt.Errorf("unable to serve http requests: %w", err)
	case sig := <-signals:
		Logger().WithField("signal", sig.String()).Info("received shutdown signal")
	}

	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		return fmt.Errorf("unable to shut down http server gracefully: %w", err)
	}
	return nil
}
