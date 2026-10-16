#!/usr/bin/env python3
"""Gera o índice de CSVs e horários de atualização de suas fontes no Git."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data-manifest.json"
UPDATE_OUTPUT = ROOT / "data/update-times.json"


def build_entry(path: Path) -> dict[str, object]:
    relative = path.relative_to(ROOT).as_posix()
    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    return {
        "name": path.name,
        "path": relative,
        "type": "file",
        "size": path.stat().st_size,
        "sha": digest,
        "download_url": f"./{quote(relative)}",
    }


def git_change_time(path: Path) -> int | None:
    """Timestamp do último commit que modificou o arquivo; não usa mtime do checkout."""
    relative = path.relative_to(ROOT).as_posix()
    try:
        process = subprocess.run(
            ["git", "log", "-1", "--format=%ct", "--", relative],
            cwd=ROOT, text=True, capture_output=True, check=False, timeout=15,
        )
        if process.returncode == 0 and process.stdout.strip().isdigit():
            return int(process.stdout.strip())
    except (OSError, subprocess.TimeoutExpired):
        pass
    return None


def last_changed(paths: list[Path]) -> dict[str, str | None]:
    latest: tuple[int, str] | None = None
    for path in paths:
        if not path.is_file():
            continue
        timestamp = git_change_time(path)
        if timestamp is None:
            continue
        relative = path.relative_to(ROOT).as_posix()
        if latest is None or (timestamp, relative) > latest:
            latest = timestamp, relative
    if latest is None:
        return {"file": None, "updatedAt": None}
    updated_at = datetime.fromtimestamp(latest[0], tz=timezone.utc)
    return {
        "file": latest[1],
        "updatedAt": updated_at.isoformat(timespec="seconds").replace("+00:00", "Z"),
    }


def build_update_times(root_csvs: list[Path]) -> dict[str, dict[str, str | None]]:
    purchases = [
        path for path in root_csvs
        if re.fullmatch(r"01\s*-\s*Compras_Almox_Parte_\d+\.csv", path.name, re.I)
    ]
    consumption = [
        path for path in root_csvs
        if path.name.casefold() == "03 - consumo.csv"
        or re.fullmatch(r"03\s*-\s*Consumo_.+\.csv", path.name, re.I)
    ]
    monthly_dir = ROOT / "consumo-mensal"
    if monthly_dir.is_dir():
        consumption.extend(
            path for path in monthly_dir.rglob("*")
            if path.is_file() and path.suffix.lower() == ".csv"
        )
    return {
        "saldo": last_changed([ROOT / "00 - Saldo_Online.csv"]),
        "compras": last_changed(purchases),
        "consumo": last_changed(consumption),
    }


def main() -> None:
    files = sorted(
        (path for path in ROOT.iterdir() if path.is_file() and path.suffix.lower() == ".csv"),
        key=lambda path: path.name.casefold(),
    )
    OUTPUT.write_text(
        json.dumps([build_entry(path) for path in files], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    UPDATE_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    UPDATE_OUTPUT.write_text(
        json.dumps(build_update_times(files), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Manifesto atualizado: {len(files)} arquivos CSV. Horários de saldo, compras e consumo registrados.")


if __name__ == "__main__":
    main()
