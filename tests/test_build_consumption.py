"""Testes isolados para a consolidação mensal de consumo."""
import csv
import io
import json
import tempfile
import unittest
from pathlib import Path

from tools.build_consumption import build, month_key, month_in_filename


COLUMNS = ["Cod_Item", "Cd Filial", "Nm Filial", "Local", "Ds Local Estoque", "mÊs", "Qt Movimento"]


def write_csv(target, rows, columns=COLUMNS, encoding="cp1252"):
    target.parent.mkdir(parents=True, exist_ok=True)
    f = io.StringIO(newline="")
    writer = csv.writer(f, delimiter=";", lineterminator="\n")
    writer.writerow(columns)
    writer.writerows(rows)
    target.write_bytes(f.getvalue().encode(encoding))


def read_merged(root):
    path = root / "data" / "consumo-consolidado.csv"
    return list(csv.DictReader(io.StringIO(path.read_bytes().decode("cp1252")), delimiter=";"))


class ConsumptionBuildTests(unittest.TestCase):
    def test_month_formats(self):
        for value in ["09/2026", "2026-09", "202609", "set/2026", "setembro_2026", "09-26"]:
            self.assertEqual(month_key(value), "09/2026", value)
        self.assertEqual(month_in_filename("03 - Consumo_Set_2026.csv"), "09/2026")
        self.assertEqual(month_in_filename("2026-10.csv"), "10/2026")
        self.assertEqual(month_key("13/2026"), "")

    def test_preserves_unreplaced_legacy_months_and_replaces_monthly_without_doubling(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_csv(root / "03 - Consumo.csv", [
                ["243.370", "704", "Abate Aves", "299", "Peças", "08/2026", "3,5"],
                ["243370", "704", "Abate Aves", "299", "Peças", "09/2026", "100"],
                ["8888", "704", "Abate Aves", "5", "Ferramentas", "09/2026", "7"],
            ])
            write_csv(root / "consumo-mensal" / "2026-09.csv", [
                ["243.370", "704", "Abate Aves", "299", "Peças", "09/2026", "1.234,5"],
                ["243370", "704", "Abate Aves", "299", "Peças", "09/2026", "2,5"],
            ])
            meta = build(root)
            rows = read_merged(root)
            self.assertEqual(len(rows), 2)
            self.assertEqual([(x["mÊs"], x["Qt Movimento"]) for x in rows], [
                ("08/2026", "3,5"), ("09/2026", "1237")
            ])
            self.assertEqual(rows[1]["Cod_Item"], "243370")
            self.assertEqual(meta["replacedLegacyMonths"], ["09/2026"])
            self.assertEqual(meta["legacyMonthsPreserved"], ["08/2026"])
            self.assertEqual(meta["consolidatedRows"], 2)
            first = (root / "data" / "consumo-consolidado.csv").read_bytes()
            self.assertEqual(build(root)["sha256"], meta["sha256"])
            self.assertEqual((root / "data" / "consumo-consolidado.csv").read_bytes(), first)
            self.assertEqual(json.loads((root / "data" / "consumo-meta.json").read_text(encoding="utf-8"))["consolidatedMonths"], 2)

    def test_legacy_abbreviated_month_is_replaced_by_same_month_of_2026(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_csv(root / "03 - Consumo.csv", [
                ["407919", "704", "Filial", "299", "Peças", "jan", "100"],
                ["407919", "704", "Filial", "299", "Peças", "fev", "20"],
            ])
            write_csv(root / "consumo-mensal" / "2026-01.csv", [
                ["407919", "704", "Filial", "299", "Peças", "jan", "12"],
            ])
            meta = build(root)
            rows = read_merged(root)
            self.assertEqual(meta["replacedLegacyMonths"], ["01/2026"])
            self.assertEqual(meta["legacyMonthsPreserved"], ["02/2026"])
            self.assertEqual([(r["mÊs"], r["Qt Movimento"]) for r in rows],
                             [("01/2026", "12"), ("02/2026", "20")])

    def test_filename_supplies_month_when_csv_has_no_month(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_csv(root / "consumo-mensal" / "2026-10.csv",
                [["409919", "704", "Rolândia", "7", "Manutenção", "2,25"]],
                columns=["Cod_Item", "Cd Filial", "Nm Filial", "Local", "Ds Local Estoque", "Qt Movimento"])
            meta = build(root)
            self.assertEqual(meta["legacyFile"], None)
            self.assertEqual(read_merged(root)[0]["mÊs"], "10/2026")
            self.assertEqual(read_merged(root)[0]["Qt Movimento"], "2,25")

    def test_duplicate_month_files_fail_instead_of_double_counting(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            row = [["123", "704", "Filial", "5", "Peças", "10/2026", "4"]]
            write_csv(root / "consumo-mensal" / "2026-10.csv", row)
            write_csv(root / "03 - Consumo_Out_2026.csv", row)
            with self.assertRaisesRegex(ValueError, "duplicada"):
                build(root)

    def test_month_mismatch_and_invalid_numbers_fail_safely(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            file = root / "consumo-mensal" / "2026-10.csv"
            write_csv(file, [["123", "704", "Filial", "5", "Peças", "09/2026", "4"]])
            with self.assertRaisesRegex(ValueError, "diferente do nome"):
                build(root)
            write_csv(file, [["123", "704", "Filial", "5", "Peças", "10/2026", "abc"]])
            with self.assertRaisesRegex(ValueError, "quantidade inválida"):
                build(root)
            self.assertFalse((root / "data" / "consumo-consolidado.csv").exists())


if __name__ == "__main__":
    unittest.main()
