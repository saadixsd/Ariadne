export default function Loading() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-base" aria-busy="true" aria-label="Loading workspace">
      <div className="h-14 border-b border-line" />
      <div className="h-10 border-b border-line" />
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)_300px]">
        {[0, 1, 2].map((column) => (
          <div key={column} className="space-y-3 border-line p-4 xl:border-r">
            <div className="h-3 w-24 animate-pulse bg-raised" />
            <div className="h-20 animate-pulse bg-raised" />
            <div className="h-20 animate-pulse bg-raised" />
            <div className="h-20 animate-pulse bg-raised" />
          </div>
        ))}
      </div>
    </div>
  );
}
