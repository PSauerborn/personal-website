package main

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// PostgresDSNFromConfig constructs a PostgreSQL DSN from the given configuration.
func PostgresDSNFromConfig(cfg *Config) string {
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%d/%s",
		cfg.PostgresUser,
		cfg.PostgresPassword,
		cfg.PostgresHost,
		cfg.PostgresPort,
		cfg.PostgresDatabase,
	)
	return dsn
}

func GenerateId() string {
	id := uuid.New().String()
	id = strings.ReplaceAll(id, "-", "")
	return id
}
