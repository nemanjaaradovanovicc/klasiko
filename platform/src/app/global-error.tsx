'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="sr-Latn">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100dvh', margin: 0, padding: 16, textAlign: 'center' }}>
        <div>
          <h1 style={{ color: '#5B2A86' }}>Klasiko trenutno ne može da se učita</h1>
          <p>Proveri internet vezu i pokušaj ponovo.</p>
          <button onClick={reset} style={{ padding: '12px 20px', borderRadius: 999, border: 0, background: '#5B2A86', color: '#fff', fontWeight: 700 }}>Pokušaj ponovo</button>
        </div>
      </body>
    </html>
  );
}
