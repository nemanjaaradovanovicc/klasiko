// Kostur stranice: prikazuje se odmah po kliku, dok server sprema podatke.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Učitavanje">
      <div className="mb-6">
        <div className="h-9 w-56 rounded-xl bg-line-2/70" />
        <div className="mt-2 h-4 w-40 rounded-lg bg-line" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[104px] rounded-2xl bg-white ring-1 ring-line">
            <div className="m-4 h-3 w-20 rounded bg-line" />
            <div className="mx-4 h-7 w-24 rounded-lg bg-line-2/60" />
          </div>
        ))}
      </div>
      <div className="card p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
            <div className="h-9 w-9 rounded-full bg-line" />
            <div className="h-4 flex-1 rounded bg-line" />
            <div className="h-4 w-16 rounded bg-line" />
          </div>
        ))}
      </div>
    </div>
  );
}
