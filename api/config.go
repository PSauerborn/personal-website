package main

import (
	"github.com/go-playground/validator/v10"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/viper"
)

type Config struct {
	Port             int    `validate:"omitempty,min=1,max=65535"`
	LogLevel         string `validate:"omitempty,oneof=debug info warn error fatal panic"`
	PostgresHost     string `validate:"required"`
	PostgresPort     int    `validate:"required"`
	PostgresDatabase string `validate:"required"`
	PostgresUser     string `validate:"required"`
	PostgresPassword string `validate:"required"`
	APIVersion       string `validate:"required"`
	ResumePathPDF    string `validate:"omitempty,file"`
	ResumePathJSON   string `validate:"required,file"`
}

// Validate checks the Config struct for required fields
func (c *Config) Validate() error {
	validate := validator.New(validator.WithRequiredStructEnabled())
	return validate.Struct(c)
}

// LoadConfig reads configuration from environment variables
// and returns a Config struct. Panics if required
// variables are missing or invalid.
func LoadConfig() *Config {
	viper.AutomaticEnv()
	// Set default values for optional variables
	viper.SetDefault("POSTGRES_PORT", 5432)
	viper.SetDefault("POSTGRES_DATABASE", "postgres")
	viper.SetDefault("API_VERSION", "v1")
	viper.SetDefault("LOG_LEVEL", "info")
	viper.SetDefault("PORT", 8080)
	viper.SetDefault("RESUME_PATH_PDF", "etc/resume.pdf")
	viper.SetDefault("RESUME_PATH_JSON", "etc/resume.json")

	cfg := &Config{
		PostgresHost:     viper.GetString("POSTGRES_HOST"),
		PostgresPort:     viper.GetInt("POSTGRES_PORT"),
		PostgresDatabase: viper.GetString("POSTGRES_DATABASE"),
		PostgresUser:     viper.GetString("POSTGRES_USER"),
		PostgresPassword: viper.GetString("POSTGRES_PASSWORD"),
		APIVersion:       viper.GetString("API_VERSION"),
		LogLevel:         viper.GetString("LOG_LEVEL"),
		Port:             viper.GetInt("PORT"),
		ResumePathPDF:    viper.GetString("RESUME_PATH_PDF"),
		ResumePathJSON:   viper.GetString("RESUME_PATH_JSON"),
	}

	if err := cfg.Validate(); err != nil {
		panic(err)
	}
	return cfg
}

// ParseLogLevel converts a string log level to logrus log.Level
// Defaults to info level if unrecognized
func ParseLogLevel(levelStr string) log.Level {
	switch levelStr {
	case "debug":
		return log.DebugLevel
	case "info":
		return log.InfoLevel
	case "warn":
		return log.WarnLevel
	case "error":
		return log.ErrorLevel
	case "fatal":
		return log.FatalLevel
	case "panic":
		return log.PanicLevel
	default:
		return log.InfoLevel
	}
}
