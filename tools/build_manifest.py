#!/usr/bin/env python3
"""Gera o índice leve usado pelo navegador para descobrir as bases CSV."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data-manifest.json"


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


def main() -> None:
    files = sorted(
        (path for path in ROOT.iterdir() if path.is_file() and path.suffix.lower() == ".csv"),
        key=lambda path: path.name.casefold(),
    )
    OUTPUT.write_text(
        json.dumps([build_entry(path) for path in files], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Manifesto atualizado: {len(files)} arquivos CSV.")


if __name__ == "__main__":
    main()
