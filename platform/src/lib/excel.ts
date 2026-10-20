'use client';

import writeExcelFile, { type SheetData } from 'write-excel-file/browser';

// Preuzimanje tabele kao .xlsx fajla u pregledaču.
export async function downloadXlsx(fileName: string, header: string[], rows: (string | number | null)[][]) {
  const data: SheetData = [
    header.map((h) => ({ value: h, fontWeight: 'bold' as const })),
    ...rows.map((r) => r.map((v) => (v === null || v === undefined ? null : v))),
  ];
  await writeExcelFile(data, { columns: header.map(() => ({ width: 22 })) }).toFile(fileName);
}
