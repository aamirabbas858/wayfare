import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-white dark:bg-black">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="max-w-2xl text-center">
          {/* Wordmark — the visual centerpiece */}
          <h1 className="text-7xl md:text-9xl font-medium tracking-tighter text-black dark:text-white mb-10 lowercase leading-none">
            wayfare<span className="text-neutral-400 dark:text-neutral-600">.</span>
          </h1>

          {/* Primary tagline */}
          <p className="text-lg md:text-xl font-medium tracking-tight text-black dark:text-white mb-2">
            Travel planning, made honest.
          </p>

          {/* Sub-tagline */}
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-12 leading-relaxed">
            Real prices. Named places. Local quirks.
          </p>

          <Link
            href="/plan"
            className="group inline-flex items-center justify-center h-12 px-8 rounded-full bg-black dark:bg-white text-white dark:text-black text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
          >
            Start planning
            <span className="ml-2 transition-transform group-hover:translate-x-0.5">→</span>
          </Link>

          <p className="text-xs text-neutral-500 mt-6">
            Free during beta · No signup required
          </p>
        </div>
      </div>

      <footer className="px-6 py-8">
        <div className="max-w-4xl mx-auto flex items-center justify-center">
          <span className="text-sm font-semibold tracking-tight text-neutral-600 dark:text-neutral-400">
            Built by A.A.N in Deutschland
          </span>
        </div>
      </footer>
    </main>
  );
}