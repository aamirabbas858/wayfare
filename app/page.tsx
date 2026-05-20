import Link from "next/link";

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

        <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-md mx-auto leading-relaxed mb-12">
          Real prices. Named places. Local quirks. No fluff.
        </p>

        <Link
          href="/plan"
          className="group inline-flex items-center justify-center h-11 px-7 rounded-full bg-white text-black text-sm font-medium hover:bg-neutral-200 transition-colors"
        >
          Start planning
          <span className="ml-2 transition-transform group-hover:translate-x-0.5">→</span>
        </Link>

        <p className="text-xs text-neutral-500 mt-6">
          Free during beta · No signup required
        </p>
      </div>
    </main>
  );
}