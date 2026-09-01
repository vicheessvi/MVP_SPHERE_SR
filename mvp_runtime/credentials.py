"""Narrow, bounded XLSX reader for the two-column credential pool."""

from __future__ import annotations

import io
import posixpath
import re
import zipfile
from dataclasses import dataclass
from typing import Any
from xml.etree import ElementTree as ET


MAX_XLSX_BYTES = 10 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 256
MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024
MAX_XML_BYTES = 16 * 1024 * 1024
MAX_ROWS = 10_000
MAX_COLUMNS = 256

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL_DOC = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_REL_PACKAGE = "http://schemas.openxmlformats.org/package/2006/relationships"


class CredentialFileError(ValueError):
    """Credential workbook is unsafe, malformed or does not meet the contract."""


@dataclass(frozen=True)
class CredentialParseResult:
    credentials: tuple[dict[str, str], ...]
    summary: dict[str, Any]


def normalize_header(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().casefold())


def parse_credential_rows(rows: list[list[Any]]) -> CredentialParseResult:
    header_index = next(
        (index for index, row in enumerate(rows) if any(str(value if value is not None else "").strip() for value in row)),
        -1,
    )
    if header_index < 0:
        raise CredentialFileError("credential_table_missing")
    headers = [normalize_header(value) for value in rows[header_index]]
    try:
        login_index = headers.index("логин")
        password_index = headers.index("пароль")
    except ValueError as error:
        raise CredentialFileError("credential_columns_missing") from error

    credentials: list[dict[str, str]] = []
    rejected_rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    duplicate_count = 0
    empty_row_count = 0
    for offset, row in enumerate(rows[header_index + 1 :]):
        row_number = header_index + offset + 2
        username = str(row[login_index] if login_index < len(row) and row[login_index] is not None else "").strip()
        password = str(row[password_index] if password_index < len(row) and row[password_index] is not None else "")
        if not username and not password.strip():
            empty_row_count += 1
            continue
        if not username or not password:
            rejected_rows.append({"rowNumber": row_number, "reason": "empty_login" if not username else "empty_password"})
            continue
        key = (username, password)
        if key in seen:
            duplicate_count += 1
            continue
        seen.add(key)
        credentials.append({"username": username, "password": password})
    if not credentials:
        raise CredentialFileError("credential_pairs_missing")
    summary = {
        "acceptedCount": len(credentials),
        "rejectedCount": len(rejected_rows),
        "duplicateCount": duplicate_count,
        "emptyRowCount": empty_row_count,
        "rejectedRows": rejected_rows,
    }
    return CredentialParseResult(tuple(credentials), summary)


def _read_bounded(archive: zipfile.ZipFile, name: str, maximum: int = MAX_XML_BYTES) -> bytes:
    try:
        info = archive.getinfo(name)
    except KeyError as error:
        raise CredentialFileError("xlsx_part_missing") from error
    if info.file_size < 0 or info.file_size > maximum:
        raise CredentialFileError("xlsx_part_too_large")
    data = archive.read(info)
    if len(data) != info.file_size or len(data) > maximum:
        raise CredentialFileError("xlsx_part_invalid")
    return data


def _safe_xml(data: bytes) -> ET.Element:
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise CredentialFileError("xlsx_xml_unsafe")
    try:
        return ET.fromstring(data)
    except ET.ParseError as error:
        raise CredentialFileError("xlsx_xml_invalid") from error


def _first_sheet_path(archive: zipfile.ZipFile) -> str:
    workbook = _safe_xml(_read_bounded(archive, "xl/workbook.xml"))
    first_sheet = workbook.find(f"{{{NS_MAIN}}}sheets/{{{NS_MAIN}}}sheet")
    if first_sheet is None:
        raise CredentialFileError("xlsx_sheet_missing")
    relation_id = first_sheet.attrib.get(f"{{{NS_REL_DOC}}}id")
    if not relation_id:
        raise CredentialFileError("xlsx_sheet_invalid")
    relationships = _safe_xml(_read_bounded(archive, "xl/_rels/workbook.xml.rels"))
    for relation in relationships.findall(f"{{{NS_REL_PACKAGE}}}Relationship"):
        if relation.attrib.get("Id") != relation_id:
            continue
        if str(relation.attrib.get("TargetMode") or "").casefold() == "external":
            raise CredentialFileError("xlsx_external_relation")
        target = str(relation.attrib.get("Target") or "").replace("\\", "/")
        normalized = posixpath.normpath(posixpath.join("xl", target))
        if normalized.startswith("../") or normalized.startswith("/") or not normalized.startswith("xl/"):
            raise CredentialFileError("xlsx_sheet_invalid")
        return normalized
    raise CredentialFileError("xlsx_sheet_missing")


def _shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = _safe_xml(_read_bounded(archive, "xl/sharedStrings.xml"))
    return ["".join(node.text or "" for node in item.iter(f"{{{NS_MAIN}}}t")) for item in root.findall(f"{{{NS_MAIN}}}si")]


def _column_index(reference: str) -> int:
    match = re.match(r"^([A-Z]+)[1-9][0-9]*$", reference.upper())
    if not match:
        raise CredentialFileError("xlsx_cell_reference_invalid")
    value = 0
    for char in match.group(1):
        value = value * 26 + ord(char) - 64
    index = value - 1
    if index >= MAX_COLUMNS:
        raise CredentialFileError("xlsx_too_many_columns")
    return index


def _cell_value(cell: ET.Element, shared: list[str]) -> Any:
    kind = cell.attrib.get("t")
    if kind == "inlineStr":
        return "".join(node.text or "" for node in cell.iter(f"{{{NS_MAIN}}}t"))
    value_node = cell.find(f"{{{NS_MAIN}}}v")
    raw = value_node.text if value_node is not None and value_node.text is not None else ""
    if kind == "s":
        try:
            return shared[int(raw)]
        except (ValueError, IndexError) as error:
            raise CredentialFileError("xlsx_shared_string_invalid") from error
    if kind == "b":
        return "true" if raw == "1" else "false"
    return raw


def _worksheet_rows(archive: zipfile.ZipFile, path: str, shared: list[str]) -> list[list[Any]]:
    root = _safe_xml(_read_bounded(archive, path))
    rows: list[list[Any]] = []
    for row_node in root.findall(f".//{{{NS_MAIN}}}sheetData/{{{NS_MAIN}}}row"):
        try:
            row_number = int(row_node.attrib.get("r") or len(rows) + 1)
        except ValueError as error:
            raise CredentialFileError("xlsx_row_invalid") from error
        if row_number < 1 or row_number > MAX_ROWS:
            raise CredentialFileError("xlsx_too_many_rows")
        while len(rows) < row_number:
            rows.append([])
        target = rows[row_number - 1]
        for cell in row_node.findall(f"{{{NS_MAIN}}}c"):
            index = _column_index(str(cell.attrib.get("r") or ""))
            while len(target) <= index:
                target.append("")
            target[index] = _cell_value(cell, shared)
    return rows


def parse_credential_workbook(data: bytes) -> CredentialParseResult:
    if not isinstance(data, (bytes, bytearray)) or not data or len(data) > MAX_XLSX_BYTES:
        raise CredentialFileError("credential_file_invalid")
    try:
        with zipfile.ZipFile(io.BytesIO(bytes(data))) as archive:
            infos = archive.infolist()
            if not infos or len(infos) > MAX_ARCHIVE_ENTRIES:
                raise CredentialFileError("xlsx_archive_invalid")
            if sum(max(0, info.file_size) for info in infos) > MAX_UNCOMPRESSED_BYTES:
                raise CredentialFileError("xlsx_archive_too_large")
            names = {info.filename.replace("\\", "/") for info in infos}
            if any(name.startswith("/") or "../" in name.split("/") for name in names):
                raise CredentialFileError("xlsx_path_invalid")
            if any("vbaproject" in name.casefold() or name.startswith("xl/externalLinks/") for name in names):
                raise CredentialFileError("xlsx_active_content_rejected")
            sheet_path = _first_sheet_path(archive)
            rows = _worksheet_rows(archive, sheet_path, _shared_strings(archive))
    except (zipfile.BadZipFile, OSError) as error:
        raise CredentialFileError("credential_file_invalid") from error
    return parse_credential_rows(rows)
