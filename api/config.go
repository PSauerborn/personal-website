package main

import (
	"strings"

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
	replacer := strings.NewReplacer(".", "_")
	viper.SetEnvKeyReplacer(replacer)

	viper.AutomaticEnv()
	// pull from config file if found
	viper.AddConfigPath("etc")
	viper.SetConfigType("yaml")

	viper.SetConfigName("config")

	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); ok {
			// Config file not found; ignore error if desired
		} else {
			// Config file was found but another error was produced
			panic(err)
		}
	}

	viper.SetConfigName("config.local") // for development
	if err := viper.MergeInConfig(); err != nil {
		// It's okay if this file doesn't exist, usually
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			panic(err)
		}
	}

	cfg := &Config{
		PostgresHost:     viper.GetString("postgres.host"),
		PostgresPort:     viper.GetInt("postgres.port"),
		PostgresDatabase: viper.GetString("postgres.database"),
		PostgresUser:     viper.GetString("postgres.user"),
		PostgresPassword: viper.GetString("postgres.password"),
		APIVersion:       viper.GetString("app.version"),
		LogLevel:         viper.GetString("app.log_level"),
		Port:             viper.GetInt("app.port"),
		ResumePathPDF:    viper.GetString("resume.path_pdf"),
		ResumePathJSON:   viper.GetString("resume.path_json"),
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
