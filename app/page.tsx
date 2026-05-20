export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-white dark:bg-black">
      <div className="max-w-2xl text-center">
        <div className="inline-flex items-center gap-2 mb-10">
          <div className="w-6 h-6 rounded-md bg-black dark:bg-white flex items-center justify-center">
            <span className="text-white dark:text-black text-xs font-medium">w</span>
          </div>
          <span className="text-sm font-medium tracking-tight text-neutral-600 dark:text-neutral-400">
            wayfare
          </span>
        </div>

        <h1 className="text-5xl md:text-6xl font-medium tracking-tight text-black dark:text-white mb-5 leading-tight">
          Honest travel planning.
        </h1>

        <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-md mx-auto leading-relaxed">
          Real prices. Named places. Local quirks. No fluff.
        </p>

        <p className="text-xs uppercase tracking-widest text-neutral-400 dark:text-neutral-600 mt-16">
          Coming soon
        </p>
      </div>
    </main>
  );
}