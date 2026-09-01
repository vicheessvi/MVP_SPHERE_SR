"""Synthetic fixtures built without third-party packages."""

from __future__ import annotations

import io
import zipfile
from html import escape


def credential_xlsx(rows: list[list[str]]) -> bytes:
    strings: list[str] = []
    indexes: dict[str, int] = {}

    def shared(value: str) -> int:
        text = str(value)
        if text not in indexes:
            indexes[text] = len(strings)
            strings.append(text)
        return indexes[text]

    row_xml: list[str] = []
    for row_number, row in enumerate(rows, 1):
        cells: list[str] = []
        for index, value in enumerate(row):
            column = ""
            number = index + 1
            while number:
                number, remainder = divmod(number - 1, 26)
                column = chr(65 + remainder) + column
            cells.append(f'<c r="{column}{row_number}" t="s"><v>{shared(str(value))}</v></c>')
        row_xml.append(f'<row r="{row_number}">{"".join(cells)}</row>')
    shared_xml = "".join(f"<si><t>{escape(value)}</t></si>" for value in strings)
    content_types = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>"""
    workbook = """<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Credentials" sheetId="1" r:id="rId1"/></sheets></workbook>"""
    relationships = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>"""
    sheet = f"""<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{''.join(row_xml)}</sheetData></worksheet>"""
    shared_strings = f"""<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(strings)}" uniqueCount="{len(strings)}">{shared_xml}</sst>"""
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", relationships)
        archive.writestr("xl/worksheets/sheet1.xml", sheet)
        archive.writestr("xl/sharedStrings.xml", shared_strings)
    return output.getvalue()
