"""Prepare idempotent, review-pending licensing imports from a private tracker JSONL.

Generated SQL contains source material. Write it only to a private output directory.
The script never connects to a database or promotes a requirement to verified.
"""

import argparse
import hashlib
import json
import re
from pathlib import Path


EXPECTED_COUNT = 1117
EXPECTED_PRIORITY = {"A": 729, "B": 388}
SOURCE_TABLE = "00-4a_Placeholder_Tracker.xlsx"
SOURCE_SYSTEM = "citizen_drive_tracker_2026_09_v2"


def load_tracker(path: Path) -> list[dict]:
    raw = path.read_bytes()
    records = [json.loads(line) for line in raw.splitlines() if line.strip()]
    if len(records) != EXPECTED_COUNT:
        raise ValueError(f"Expected {EXPECTED_COUNT} tracker rows; found {len(records)}")
    priorities = {priority: sum(row.get("priority") == priority for row in records)
                  for priority in EXPECTED_PRIORITY}
    if priorities != EXPECTED_PRIORITY:
        raise ValueError(f"Priority counts differ: {priorities}")
    for number, row in enumerate(records, 1):
        code = f"CD-COV-00.4-{number:04d}"
        if row.get("requirement_code") != code:
            raise ValueError(f"Tracker code mismatch at row {number}")
        if row.get("source_status", "").casefold() != "open":
            raise ValueError(f"Non-open tracker row {number} requires review")
        if not re.fullmatch(r"[0-9a-f]{64}", row.get("source_digest", "")):
            raise ValueError(f"Missing content digest at row {number}")
        if not row.get("title"):
            raise ValueError(f"Missing title at row {number}")
    return records


def sql_for_chunk(records: list[dict]) -> str:
    payload = json.dumps(records, ensure_ascii=True, separators=(",", ":")).replace("'", "''")
    return f"""WITH input AS (
  SELECT * FROM jsonb_to_recordset('{payload}'::jsonb) AS row(
    requirement_code text, source_digest text, title text, notes text,
    pack_document_code text, pack_section text, requirement_type text,
    priority text, owner_role text, due_date date
  )
), source_rows AS (
  INSERT INTO platform.source_records
    (source_system, source_table, source_id, source_digest, review_state)
  SELECT '{SOURCE_SYSTEM}', '{SOURCE_TABLE}', requirement_code, source_digest, 'pending'
  FROM input
  ON CONFLICT (source_system, source_table, source_id, source_digest)
  DO UPDATE SET imported_at = platform.source_records.imported_at
  RETURNING id, source_id, source_digest
), requirements_inserted AS (
  INSERT INTO licensing.requirements
    (entity_id, requirement_code, title, description, pack_document_code,
     pack_section, requirement_type, priority, owner_role, due_date,
     status, source_record_id)
  SELECT entity.id, input.requirement_code, input.title, input.notes,
         input.pack_document_code, input.pack_section, input.requirement_type,
         input.priority::char(1), input.owner_role, input.due_date,
         'open', source_rows.id
  FROM input
  JOIN source_rows ON source_rows.source_id = input.requirement_code
                  AND source_rows.source_digest = input.source_digest
  CROSS JOIN platform.legal_entities entity
  WHERE entity.registration_number = '99073'
  ON CONFLICT (entity_id, requirement_code) DO NOTHING
  RETURNING id
)
SELECT (SELECT count(*)::int FROM input) AS expected,
       (SELECT count(*)::int FROM source_rows) AS source_rows,
       (SELECT count(*)::int FROM requirements_inserted) AS new_requirements;\n"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("tracker", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--chunk-size", type=int, default=25)
    args = parser.parse_args()
    if not 1 <= args.chunk_size <= 100:
        raise ValueError("Chunk size must be between 1 and 100")
    records = load_tracker(args.tracker)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    chunks = []
    for start in range(0, len(records), args.chunk_size):
        name = f"licence-{start // args.chunk_size + 1:03d}.sql"
        file = args.output_dir / name
        file.write_text(sql_for_chunk(records[start:start + args.chunk_size]), encoding="utf-8")
        chunks.append(name)
    manifest = {
        "source_sha256": hashlib.sha256(args.tracker.read_bytes()).hexdigest(),
        "records": len(records),
        "priorities": EXPECTED_PRIORITY,
        "source_system": SOURCE_SYSTEM,
        "chunks": chunks,
    }
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"records": len(records), "chunks": len(chunks), "priorities": EXPECTED_PRIORITY}))


if __name__ == "__main__":
    main()
