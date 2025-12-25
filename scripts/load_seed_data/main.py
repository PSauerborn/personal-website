import logging
from pathlib import Path

import psycopg

LOGGER = logging.getLogger(__name__)

SQL_BASE_PATH = Path("data")


def configure_logging(level: str):
    """configure_logging sets up logging configuration based on the provided
    level."""

    mapping = {
        "CRITICAL": logging.CRITICAL,
        "ERROR": logging.ERROR,
        "WARNING": logging.WARNING,
        "INFO": logging.INFO,
        "DEBUG": logging.DEBUG,
    }

    logging.basicConfig(level=mapping.get(level.upper(), logging.INFO))


def get_db_connection(args) -> psycopg.Connection:
    """get_db_connection establishes and returns a database connection using
    provided arguments."""

    conn = psycopg.connect(
        host=args.db_host,
        port=args.db_port,
        user=args.db_user,
        password=args.db_password,
        dbname=args.db_name,
    )

    # test connection
    with conn.cursor() as cur:
        cur.execute("SELECT 1;")
        result = cur.fetchone()
        if result is None or result[0] != 1:
            raise Exception("Database connection test failed.")

    return conn


def truncate_tables(conn: psycopg.Connection, tables: list[str]):
    """truncate_tables truncates the specified tables in the database."""

    with conn.cursor() as cur:
        for table in tables:
            LOGGER.info(f"Truncating table: {table}")
            cur.execute(f"TRUNCATE TABLE {table} CASCADE;")
        conn.commit()
    LOGGER.info("Successfully truncated tables.")


def load_sql_files() -> dict[str, bytes]:
    """load_sql_files loads all SQL files from the SQL_BASE_PATH directory"""

    sql_files = [
        SQL_BASE_PATH / "contacts.sql",
        SQL_BASE_PATH / "contact_requests.sql",
        SQL_BASE_PATH / "logged_requests.sql",
        SQL_BASE_PATH / "logged_responses.sql",
    ]  # order matters due to foreign key constraints

    sql_statements = []

    for sql_file in sql_files:
        with open(sql_file, "rb") as f:
            sql_statements.append((sql_file, f.read()))

    return sql_statements


def main(args):
    """main is the entry point for the script to seed the database with initial data.
    Tables are truncated before seeding to ensure a clean state, and replaced
    data is inserted from SQL files located in the data directory."""

    try:
        LOGGER.info(f"Connecting to database at {args.db_host}:{args.db_port}.")
        conn = get_db_connection(args)

        tables_to_truncate = [
            "base.logged_responses",
            "base.logged_requests",
            "base.contact_requests",
            "base.contacts",
        ]

        LOGGER.info("Truncating existing data from tables.")
        truncate_tables(conn, tables_to_truncate)

        files = load_sql_files()
        LOGGER.info(f"Loaded {len(files)} SQL files to seed.")

        for name, sql in files:
            LOGGER.info(f"Executing SQL file: {name}")
            with conn.cursor() as cur:
                cur.execute(sql)
            conn.commit()
            LOGGER.info(f"Successfully executed SQL file: {name}")

    except:  # noqa: E722
        LOGGER.exception("An error occurred while seeding the database.")
        raise

    finally:
        LOGGER.info("Closing database connection.")
        conn.close()


if __name__ == "__main__":

    from argparse import ArgumentParser

    parser = ArgumentParser(description="Seed Environment Script")

    # add args for DB connection settings
    parser.add_argument("--db-host", type=str, required=True, help="Database host")
    parser.add_argument("--db-port", type=int, default=5432, help="Database port")
    parser.add_argument("--db-user", type=str, required=True, help="Database user")
    parser.add_argument(
        "--db-password", type=str, required=True, help="Database password"
    )
    parser.add_argument("--db-name", type=str, default="postgres", help="Database name")
    parser.add_argument("--log-level", type=str, default="INFO", help="Logging level")

    args = parser.parse_args()

    configure_logging(args.log_level)

    main(args)
