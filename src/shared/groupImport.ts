import { GROUP_CATALOG_CONSTRAINTS } from './constants';
import {
  normalizeDisplayName,
  normalizeGroupIdentity,
  type GroupCatalogReason,
} from './groupCatalog';
import { generateId } from './utils';
import type { CatalogGroupEntry } from './types';

export type GroupImportReason =
  | GroupCatalogReason
  | 'unsupported_file'
  | 'file_too_large'
  | 'too_many_rows'
  | 'invalid_csv'
  | 'missing_identity_column'
  | 'too_many_columns'
  | 'duplicate_in_file'
  | 'duplicate_existing';

export type GroupImportRowStatus = 'valid' | 'duplicate' | 'invalid';

export interface GroupImportRow {
  sourceRow: number;
  identity: string;
  name: string;
  status: GroupImportRowStatus;
  reasonCode?: GroupImportReason;
  reason?: string;
  candidate?: CatalogGroupEntry;
}

export interface GroupImportPreview {
  id: string;
  fileName: string;
  sizeBytes: number;
  format: 'csv' | 'txt';
  separator: 'comma' | 'semicolon' | 'tab' | 'line';
  rows: GroupImportRow[];
  totalCount: number;
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  createdAt: number;
}

export type GroupImportParseResult =
  | { ok: true; preview: GroupImportPreview }
  | { ok: false; error: { code: GroupImportReason; message: string } };

interface ParsedRecord {
  sourceRow: number;
  values: string[];
}

const ID_HEADERS = new Set(['groupid', 'id', 'url', 'groupurl']);
const NAME_HEADERS = new Set(['name', 'groupname', 'label', 'displayname']);

/** Parse an import file without mutating catalog storage. */
export async function previewGroupImport(
  file: File,
  existingGroups: readonly CatalogGroupEntry[],
): Promise<GroupImportParseResult> {
  const format = file.name.toLowerCase().endsWith('.csv')
    ? 'csv'
    : file.name.toLowerCase().endsWith('.txt')
      ? 'txt'
      : null;
  if (!format) {
    return parseFailure('unsupported_file', 'Choose a .csv or .txt file.');
  }
  if (file.size > GROUP_CATALOG_CONSTRAINTS.MAX_IMPORT_FILE_SIZE_BYTES) {
    return parseFailure('file_too_large', 'File exceeds the 1 MiB import limit.');
  }

  let text: string;
  try {
    text = (await readFileText(file)).replace(/^\uFEFF/, '');
  } catch {
    return parseFailure('invalid_csv', 'Could not read this file as UTF-8 text.');
  }

  const separator = detectSeparator(text);
  const parsed = parseRecords(text, separator.character);
  if (!parsed.ok) return parseFailure('invalid_csv', parsed.message);

  const records = parsed.records.filter((record) => record.values.some((value) => value.trim()));
  if (records.length > GROUP_CATALOG_CONSTRAINTS.MAX_IMPORT_ROWS) {
    return parseFailure(
      'too_many_rows',
      `Import contains more than ${GROUP_CATALOG_CONSTRAINTS.MAX_IMPORT_ROWS.toLocaleString()} non-empty rows.`,
    );
  }

  const columns = getColumns(records);
  const existingById = new Map(existingGroups.map((group) => [group.groupId, group]));
  const seenFileIds = new Set<string>();
  const rows = records.slice(columns.dataStart).map((record) => {
    if (columns.identityIndex === null) {
      return invalidRow(
        record.sourceRow,
        '',
        '',
        'missing_identity_column',
        'Missing group ID or URL column.',
      );
    }
    const identity = record.values[columns.identityIndex] ?? '';
    const name = columns.nameIndex === null ? '' : (record.values[columns.nameIndex] ?? '');
    if (columns.headerless && record.values.length > 2) {
      return invalidRow(
        record.sourceRow,
        identity,
        name,
        'too_many_columns',
        'Headerless rows can contain only group identity and name.',
      );
    }

    const normalized = normalizeGroupIdentity(identity);
    if (!normalized.ok) {
      return invalidRow(
        record.sourceRow,
        identity,
        name,
        normalized.error.code,
        normalized.error.message,
      );
    }

    const duplicate = existingById.get(normalized.value.groupId);
    if (duplicate) {
      return duplicateRow(
        record.sourceRow,
        identity,
        name,
        'duplicate_existing',
        `Already in active groups as “${duplicate.name}”.`,
      );
    }
    if (seenFileIds.has(normalized.value.groupId)) {
      return duplicateRow(
        record.sourceRow,
        identity,
        name,
        'duplicate_in_file',
        'Duplicates an earlier row in this file.',
      );
    }

    seenFileIds.add(normalized.value.groupId);
    return {
      sourceRow: record.sourceRow,
      identity,
      name,
      status: 'valid' as const,
      candidate: {
        ...normalized.value,
        name: normalizeDisplayName(name, normalized.value.groupId),
      },
    };
  });

  const validCount = rows.filter((row) => row.status === 'valid').length;
  const duplicateCount = rows.filter((row) => row.status === 'duplicate').length;
  const invalidCount = rows.filter((row) => row.status === 'invalid').length;
  return {
    ok: true,
    preview: {
      id: generateId(),
      fileName: file.name,
      sizeBytes: file.size,
      format,
      separator: separator.name,
      rows,
      totalCount: rows.length,
      validCount,
      duplicateCount,
      invalidCount,
      createdAt: Date.now(),
    },
  };
}

function getColumns(records: ParsedRecord[]): {
  identityIndex: number | null;
  nameIndex: number | null;
  dataStart: number;
  headerless: boolean;
} {
  const header = records[0]?.values ?? [];
  const headerIndexes = header.map(normalizeHeader);
  const hasKnownHeader = headerIndexes.some(
    (value) => ID_HEADERS.has(value) || NAME_HEADERS.has(value),
  );
  if (hasKnownHeader) {
    const identityIndex = headerIndexes.findIndex((value) => ID_HEADERS.has(value));
    const nameIndex = headerIndexes.findIndex((value) => NAME_HEADERS.has(value));
    return {
      identityIndex: identityIndex === -1 ? null : identityIndex,
      nameIndex: nameIndex === -1 ? null : nameIndex,
      dataStart: 1,
      headerless: false,
    };
  }

  return {
    identityIndex: 0,
    nameIndex: header.length > 1 ? 1 : null,
    dataStart: 0,
    headerless: true,
  };
}

function detectSeparator(text: string): {
  name: GroupImportPreview['separator'];
  character: string;
} {
  const candidates: Array<{ name: GroupImportPreview['separator']; character: string }> = [
    { name: 'comma', character: ',' },
    { name: 'semicolon', character: ';' },
    { name: 'tab', character: '\t' },
  ];
  const sample = text.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const best = candidates
    .map((candidate) => ({ ...candidate, count: countUnquoted(sample, candidate.character) }))
    .sort((left, right) => right.count - left.count)[0];
  return best.count > 0 ? best : { name: 'line', character: '\n' };
}

function parseRecords(
  text: string,
  separator: string,
): { ok: true; records: ParsedRecord[] } | { ok: false; message: string } {
  if (!text.trim()) return { ok: true, records: [] };
  if (separator === '\n') {
    return {
      ok: true,
      records: text
        .split(/\r?\n/)
        .map((value, index) => ({ sourceRow: index + 1, values: [value] })),
    };
  }

  const records: ParsedRecord[] = [];
  let values: string[] = [];
  let value = '';
  let inQuotes = false;
  let sourceRow = 1;
  let recordStart = 1;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && character === separator) {
      values.push(value);
      value = '';
      continue;
    }
    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index++;
      values.push(value);
      records.push({ sourceRow: recordStart, values });
      values = [];
      value = '';
      sourceRow++;
      recordStart = sourceRow;
      continue;
    }
    value += character;
  }

  if (inQuotes) return { ok: false, message: 'CSV contains an unclosed quoted field.' };
  values.push(value);
  records.push({ sourceRow: recordStart, values });
  return { ok: true, records };
}

function countUnquoted(value: string, separator: string): number {
  let inQuotes = false;
  let count = 0;
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '"') {
      if (inQuotes && value[index + 1] === '"') index++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && value[index] === separator) {
      count++;
    }
  }
  return count;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .replace(/[\s_-]/g, '')
    .toLowerCase();
}

function invalidRow(
  sourceRow: number,
  identity: string,
  name: string,
  reasonCode: GroupImportReason,
  reason: string,
): GroupImportRow {
  return { sourceRow, identity, name, status: 'invalid', reasonCode, reason };
}

function duplicateRow(
  sourceRow: number,
  identity: string,
  name: string,
  reasonCode: Extract<GroupImportReason, 'duplicate_in_file' | 'duplicate_existing'>,
  reason: string,
): GroupImportRow {
  return { sourceRow, identity, name, status: 'duplicate', reasonCode, reason };
}

function parseFailure(code: GroupImportReason, message: string): GroupImportParseResult {
  return { ok: false, error: { code, message } };
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}
