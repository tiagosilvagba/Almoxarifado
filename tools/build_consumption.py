#!/usr/bin/env python3
"""Consolida CSVs mensais de consumo sem sobrescrever o histórico original.

Entradas:
  03 - Consumo.csv                  histórico legado (somente leitura)
  consumo-mensal/*.csv              um arquivo completo por competência
  03 - Consumo_<mes>_<ano>.csv      alternativa para envios na raiz

Saídas:
  data/consumo-consolidado.csv       base única agregada, compatível com o Worker
  data/consumo-meta.json            auditoria das competências e fontes
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import unicodedata
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path

COLS = ["Cod_Item", "Cd Filial", "Nm Filial", "Local", "Ds Local Estoque", "mÊs", "Qt Movimento"]
MONTH_NAMES = {
    "jan": 1, "janeiro": 1, "feb": 2, "fev": 2, "fevereiro": 2,
    "mar": 3, "marco": 3, "março": 3, "abr": 4, "abril": 4,
    "mai": 5, "maio": 5, "jun": 6, "junho": 6,
    "jul": 7, "julho": 7, "ago": 8, "agosto": 8,
    "set": 9, "setembro": 9, "sep": 9, "out": 10, "outubro": 10,
    "nov": 11, "novembro": 11, "dez": 12, "dezembro": 12,
}
ALIASES = {
    "coditem": "code", "cditem": "code", "codigoitem": "code",
    "cdfilial": "branch", "codigofilial": "branch", "filial": "branch",
    "nmfilial": "branch_name", "nomefilial": "branch_name",
    "local": "local", "cdlocal": "local", "codigolocal": "local",
    "dslocalestoque": "local_name", "nmlocalestoque": "local_name",
    "mes": "month", "competencia": "month", "anomes": "month",
    "qtmovimento": "quantity", "qtdmovimento": "quantity", "quantidademovimento": "quantity",
}

def key(value: str) -> str:
    normalized = unicodedata.normalize("NFD", str(value or ""))
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in normalized if not unicodedata.combining(c)).lower())

def month_key(value: str) -> str:
    text = unicodedata.normalize("NFD", str(value or "").strip().lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"\s+", "", text)
    if not text:
        return ""
    yyyy_mm = re.fullmatch(r"(20\d{2})[-_/](\d{1,2})(?:[-_/]\d{1,2})?", text)
    mm_yyyy = re.fullmatch(r"(\d{1,2})[-_/](20\d{2}|\d{2})", text)
    digits = re.fullmatch(r"(20\d{2})(0[1-9]|1[0-2])", text)
    words = re.fullmatch(r"([a-z]+)[-_/]?(20\d{2}|\d{2})", text)
    if yyyy_mm:
        year, month = int(yyyy_mm.group(1)), int(yyyy_mm.group(2))
    elif mm_yyyy:
        month, year = int(mm_yyyy.group(1)), int(mm_yyyy.group(2))
    elif digits:
        year, month = int(digits.group(1)), int(digits.group(2))
    elif words and words.group(1) in MONTH_NAMES:
        month, year = MONTH_NAMES[words.group(1)], int(words.group(2))
    else:
        return ""
    if year < 100:
        year += 2000
    return f"{month:02d}/{year:04d}" if 1 <= month <= 12 and 2000 <= year <= 2100 else ""

def month_in_filename(filename: str) -> str:
    name = Path(filename).stem.lower()
    name = re.sub(r"^(?:03\s*[-_ ]\s*)?consumo(?:[_ -]*)", "", name)
    if not name:
        return ""
    return month_key(name) or month_key(name.replace("_", "/"))

def parse_quantity(value: str, source: Path, line: int) -> Decimal:
    cleaned = str(value or "").strip().replace("\xa0", "").replace(" ", "")
    if not cleaned:
        return Decimal(0)
    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        amount = Decimal(cleaned)
    except InvalidOperation as exc:
        raise ValueError(f"{source.name}, linha {line}: quantidade inválida: {value!r}") from exc
    if not amount.is_finite():
        raise ValueError(f"{source.name}, linha {line}: quantidade não finita")
    return amount

def load_rows(path: Path, *, monthly: bool) -> tuple[list[dict], set[str]]:
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")
    sample = text[:4096]
    delimiter = ";" if sample.count(";") >= sample.count("\t") else "\t"
    reader = csv.DictReader(io.StringIO(text, newline=""), delimiter=delimiter)
    if not reader.fieldnames:
        raise ValueError(f"{path.name}: CSV sem cabeçalho")
    fields = {ALIASES.get(key(name)): name for name in reader.fieldnames if name is not None}
    required = {"code", "branch", "local", "quantity"}
    if not required.issubset(fields) or (not monthly and "month" not in fields):
        missing = ", ".join(sorted(required - fields.keys()))
        if not monthly and "month" not in fields:
            missing += (", " if missing else "") + "month"
        raise ValueError(f"{path.name}: colunas obrigatórias ausentes: {missing}")
    expected_month = month_in_filename(path.name) if monthly else ""
    rows, months = [], set()
    for line, values in enumerate(reader, start=2):
        if None in values:
            raise ValueError(f"{path.name}, linha {line}: número de colunas inconsistente")
        def get(name: str) -> str:
            return str(values.get(fields.get(name, ""), "") or "").strip()
        item = get("code").replace(".", "")
        branch, local = get("branch"), get("local")
        if not item or not branch or not local or key(item) in {"coditem", "cditem"}:
            continue
        raw_month = get("month")
        month = month_key(raw_month) or expected_month
        if not month:
            if monthly:
                raise ValueError(f"{path.name}, linha {line}: informe a competência no CSV ou no nome do arquivo")
            # Preserva competência legada não reconhecida sem inventar mês.
            if not raw_month:
                continue
            month = raw_month
        if expected_month and month != expected_month:
            raise ValueError(f"{path.name}, linha {line}: competência {month} diferente do nome ({expected_month})")
        months.add(month)
        rows.append({
            "code": item, "branch": branch, "local": local, "month": month,
            "branch_name": get("branch_name"), "local_name": get("local_name"),
            "quantity": parse_quantity(get("quantity"), path, line),
        })
    if monthly and not rows:
        raise ValueError(f"{path.name}: arquivo mensal sem registros válidos")
    if monthly and len(months) != 1:
        raise ValueError(f"{path.name}: arquivo mensal contém {len(months)} competências; envie um mês por CSV")
    return rows, months

def monthly_files(root: Path) -> list[Path]:
    candidates = list((root / "consumo-mensal").glob("**/*")) if (root / "consumo-mensal").exists() else []
    candidates += list(root.glob("03 - Consumo_*.csv")) + list(root.glob("03 - Consumo_*.CSV"))
    return sorted({p for p in candidates if p.is_file() and p.suffix.lower() == ".csv"}, key=lambda p: str(p).casefold())

def decimal_for_csv(number: Decimal) -> str:
    if number == 0:
        return "0"
    return format(number.normalize(), "f").replace(".", ",")

def write_if_changed(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)

def build(root: Path) -> dict:
    legacy_path = root / "03 - Consumo.csv"
    monthly = monthly_files(root)
    if not legacy_path.exists() and not monthly:
        raise ValueError("Não há 03 - Consumo.csv nem arquivos em consumo-mensal/")
    legacy_rows, legacy_months = load_rows(legacy_path, monthly=False) if legacy_path.exists() else ([], set())
    monthly_inputs = []
    month_owners = {}
    for file in monthly:
        rows, months = load_rows(file, monthly=True)
        month = next(iter(months))
        if month in month_owners:
            raise ValueError(f"Competência {month} duplicada: {month_owners[month]} e {file.name}. Substitua o arquivo antigo em vez de adicionar outro.")
        month_owners[month] = file.relative_to(root).as_posix()
        monthly_inputs.append((file, rows))
    selected = set(month_owners)
    # Um mês mensal completo substitui o mesmo mês do histórico legado.
    combined = [row for row in legacy_rows if row["month"] not in selected]
    for _, rows in monthly_inputs:
        combined.extend(rows)
    sums = defaultdict(Decimal)
    labels = {}
    for row in combined:
        group = (row["code"], row["branch"], row["local"], row["month"])
        sums[group] += row["quantity"]
        old = labels.get(group, ("", ""))
        labels[group] = (
            row["branch_name"] or old[0],
            row["local_name"] or old[1],
        )
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, delimiter=";", lineterminator="\n")
    writer.writerow(COLS)
    for (code, branch, local, month), quantity in sorted(
        sums.items(), key=lambda entry: (entry[0][3][-4:], entry[0][3][:2], entry[0][0], entry[0][1], entry[0][2])
    ):
        branch_name, local_name = labels[(code, branch, local, month)]
        writer.writerow([code, branch, branch_name, local, local_name, month, decimal_for_csv(quantity)])
    output = buffer.getvalue().encode("cp1252", errors="replace")
    meta = {
        "format": "consumo-consolidado-v1",
        "legacyFile": legacy_path.name if legacy_path.exists() else None,
        "legacyMonthsPreserved": sorted(legacy_months - selected),
        "monthlyFiles": [{"file": month_owners[month], "month": month} for month in sorted(selected)],
        "replacedLegacyMonths": sorted(legacy_months & selected),
        "sourceRows": len(legacy_rows) + sum(len(rows) for _, rows in monthly_inputs),
        "consolidatedRows": len(sums),
        "consolidatedMonths": len(set(group[3] for group in sums)),
        "sha256": hashlib.sha256(output).hexdigest(),
    }
    write_if_changed(root / "data" / "consumo-consolidado.csv", output)
    write_if_changed(root / "data" / "consumo-meta.json", (json.dumps(meta, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    return meta

if __name__ == "__main__":
    cli = argparse.ArgumentParser()
    cli.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = cli.parse_args()
    try:
        summary = build(args.root.resolve())
        print(f"Consumo: {summary['consolidatedRows']} linhas únicas; {summary['consolidatedMonths']} competências; {len(summary['monthlyFiles'])} arquivos mensais.")
    except ValueError as error:
        cli.exit(1, f"Erro ao consolidar consumo: {error}\n")
