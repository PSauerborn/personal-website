package main

import "testing"

func TestPostgresDSNFromConfig(t *testing.T) {
	config := &Config{
		PostgresUser:     "testuser",
		PostgresPassword: "testpass",
		PostgresHost:     "localhost",
		PostgresPort:     5432,
		PostgresDatabase: "testdb",
	}

	expectedDSN := "postgres://testuser:testpass@localhost:5432/testdb"
	actualDSN := PostgresDSNFromConfig(config)

	if actualDSN != expectedDSN {
		t.Errorf("Expected DSN %s, but got %s", expectedDSN, actualDSN)
	}
}
