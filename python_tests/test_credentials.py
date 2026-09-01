from __future__ import annotations

import io
import unittest
import zipfile

from mvp_runtime.credentials import CredentialFileError, parse_credential_rows, parse_credential_workbook
from python_tests.helpers import credential_xlsx


class CredentialTests(unittest.TestCase):
    def test_rows_require_russian_headers_and_normalize_pool(self) -> None:
        parsed = parse_credential_rows([
            ["  Логин ", "Пароль"],
            [" synthetic-user-a ", "synthetic-one"],
            ["synthetic-user-a", "synthetic-one"],
            ["", "synthetic-rejected"],
            ["operator", "synthetic-two"],
            ["", ""],
        ])
        self.assertEqual(parsed.credentials, (
            {"username": "synthetic-user-a", "password": "synthetic-one"},
            {"username": "operator", "password": "synthetic-two"},
        ))
        self.assertEqual(parsed.summary["acceptedCount"], 2)
        self.assertEqual(parsed.summary["duplicateCount"], 1)
        self.assertEqual(parsed.summary["rejectedRows"], [{"rowNumber": 4, "reason": "empty_login"}])
        self.assertEqual(parsed.summary["emptyRowCount"], 1)

    def test_first_sheet_xlsx_is_parsed_without_dependencies(self) -> None:
        data = credential_xlsx([["Логин", "Пароль"], ["synthetic-user", "SYNTHETIC-PASSWORD"]])
        parsed = parse_credential_workbook(data)
        self.assertEqual(parsed.summary["acceptedCount"], 1)
        self.assertEqual(parsed.credentials[0]["username"], "synthetic-user")

    def test_malformed_active_or_oversized_workbooks_are_rejected(self) -> None:
        for data in (b"not-xlsx", b"", b"x" * (10 * 1024 * 1024 + 1)):
            with self.assertRaises(CredentialFileError):
                parse_credential_workbook(data)
        active = io.BytesIO()
        with zipfile.ZipFile(active, "w") as archive:
            archive.writestr("xl/vbaProject.bin", b"synthetic")
        with self.assertRaises(CredentialFileError):
            parse_credential_workbook(active.getvalue())

    def test_missing_columns_and_partial_only_rows_are_rejected(self) -> None:
        with self.assertRaises(CredentialFileError):
            parse_credential_rows([["User", "Secret"], ["a", "b"]])
        with self.assertRaises(CredentialFileError):
            parse_credential_rows([["Логин", "Пароль"], ["only-user", ""]])


if __name__ == "__main__":
    unittest.main()
