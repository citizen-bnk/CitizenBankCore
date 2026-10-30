"""Prepare a private, reviewable import of the Citizen Digital CBL gap tracker.

This script does not connect to a database. Keep its JSONL output out of Git.
Requires openpyxl in the operator's Python environment.
"""
import argparse
import hashlib
import json
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook


def value(item):
    if isinstance(item, (date, datetime)):
        return item.isoformat()
    return str(item).strip() if item is not None else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit('Output already exists; choose a new path to preserve the prior snapshot.')
    book = load_workbook(args.source, read_only=True, data_only=True)
    sheet = book['Tracker']
    expected = ['No.', 'Doc', 'Document title', 'Section', 'Item', 'Type', 'Priority', 'Owner', 'Status', 'Due date', 'Replacement value / evidence reference', 'Notes']
    rows = sheet.values
    if list(next(rows)) != expected:
        raise SystemExit('Unexpected tracker layout; inspect the source before import.')
    prepared = []
    for row in rows:
        if row[0] is None:
            continue
        no = int(row[0])
        fields = [value(cell) for cell in row]
        if fields[6] not in ('A', 'B') or fields[8] not in ('Open', 'In progress', 'Closed'):
            raise SystemExit(f'Unrecognised priority/status at source row {no}.')
        digest = hashlib.sha256(json.dumps(fields, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
        prepared.append({
            'requirement_code': f'CD-COV-00.4-{no:04d}',
            'pack_document_code': fields[1],
            'pack_document_title': fields[2],
            'pack_section': fields[3],
            'title': fields[4],
            'requirement_type': fields[5],
            'priority': fields[6],
            'owner_role': fields[7],
            'source_status': fields[8],
            'due_date': fields[9],
            'evidence_reference': fields[10],
            'notes': fields[11],
            'source_digest': digest,
        })
    if len(prepared) != 1117 or len({r['requirement_code'] for r in prepared}) != len(prepared):
        raise SystemExit('Tracker count or identifiers differ from the reviewed September pack.')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as file:
        for record in prepared:
            file.write(json.dumps(record, ensure_ascii=False) + '\n')
    print(f'Prepared {len(prepared)} private records: A={sum(r["priority"] == "A" for r in prepared)}, B={sum(r["priority"] == "B" for r in prepared)}')


if __name__ == '__main__':
    main()
