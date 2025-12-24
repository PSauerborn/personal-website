import json
from pathlib import Path

from pydantic import BaseModel

FIXTURES_BASE_PATH = Path("outputs/fixtures")


def load_fixtures(
    filename: str, model: BaseModel | None = None
) -> list[dict | BaseModel]:
    """load_fixtures loads fixture data from a JSON file."""

    filepath = FIXTURES_BASE_PATH / filename
    with open(filepath, "r") as f:
        data = json.load(f)

    if model is not None:
        # Parse each item into the provided Pydantic model
        data = [model(**item) for item in data]

    return data


def dump_fixtures(filename: str, data: list[BaseModel]) -> None:
    """dump_fixtures writes fixture data to a JSON file."""

    serialized = [item.model_dump(mode="json") for item in data]

    filepath = FIXTURES_BASE_PATH / filename
    with open(filepath, "w") as f:
        json.dump(serialized, f, indent=2)
