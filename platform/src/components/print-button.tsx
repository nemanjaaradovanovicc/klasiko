'use client';

import { Printer } from 'lucide-react';

export function PrintButton({ label = 'Štampaj / PDF' }: { label?: string }) {
  return (
    <button type="button" className="btn btn-soft print:hidden" onClick={() => window.print()}>
      <Printer size={16} /> {label}
    </button>
  );
}
