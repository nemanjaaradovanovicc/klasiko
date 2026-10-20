'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { downloadXlsx } from '@/lib/excel';

export function ExportButton({ label, fileName, header, rows }: { label: string; fileName: string; header: string[]; rows: (string | number | null)[][] }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-soft"
      disabled={busy}
      onClick={async () => { setBusy(true); try { await downloadXlsx(fileName, header, rows); } finally { setBusy(false); } }}
    >
      <Download size={16} /> {busy ? 'Pripremam...' : label}
    </button>
  );
}
