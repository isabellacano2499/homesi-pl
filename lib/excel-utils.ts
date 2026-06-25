import * as XLSX from "xlsx";

/**
 * Reads an Excel buffer and returns the target sheet as a raw 2-D array.
 * The sheet is selected by the first name that satisfies `sheetMatcher`;
 * falls back to the first sheet in the workbook if none matches.
 *
 * All values are returned raw (no date coercion, no type guessing) so that
 * each parser can apply its own coercion rules explicitly.
 */
export function readSheetRaw(
  buffer: Buffer,
  sheetMatcher: (name: string) => boolean
): unknown[][] {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
    raw: true,
  });

  const sheetName =
    workbook.SheetNames.find(sheetMatcher) ?? workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];
}
