"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon, LeafIcon, MapPinnedIcon, SparklesIcon } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050d0b] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(79,223,152,0.22),transparent_30%),radial-gradient(circle_at_84%_16%,rgba(72,187,120,0.24),transparent_33%),linear-gradient(130deg,#04100b_0%,#081813_40%,#06120e_100%)]" />
      <div className="pointer-events-none absolute -left-20 top-1/3 h-72 w-72 rounded-full border border-emerald-300/15 bg-emerald-300/5 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-8 h-80 w-80 rounded-full border border-emerald-100/10 bg-emerald-100/5 blur-3xl" />

      <nav className="fixed top-0 z-30 w-full border-b border-emerald-100/30 bg-emerald-100/8 backdrop-blur-xl supports-[backdrop-filter]:bg-emerald-100/10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3 md:px-10">
          <div className="inline-flex items-center gap-2 text-lg font-semibold tracking-wide text-emerald-50 sm:text-xl">
            <LeafIcon className="h-5 w-5 text-emerald-300 sm:h-6 sm:w-6" />
            Leaf
          </div>
          <Button
            variant="ghost"
            className="h-auto rounded-full px-4 py-1.5 text-sm text-emerald-100 hover:bg-emerald-100/15 hover:text-white"
            onClick={() => signIn("github", { callbackUrl: "/chat" })}
          >
            Get started
          </Button>
        </div>
      </nav>

      <div className="relative mx-auto flex min-h-[calc(100vh-57px)] w-full max-w-6xl flex-col justify-between px-6 py-8 md:px-10 lg:py-10 lg:pt-[80px]">
        <header className="animate-in fade-in duration-700">

          <div className="mt-7 max-w-3xl space-y-6">
            <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Leaf makes AI usage more sustainable,
              <span className="text-emerald-300"> while keeping responses accurate.</span>
            </h1>
            <p className="max-w-2xl text-pretty text-base leading-relaxed text-emerald-50/80 sm:text-lg">
              Leaf routes each prompt to the right-sized agent and serves requests from greener datacenters when possible. The result is strong answer quality with lower carbon impact and less unnecessary compute.
            </p>
          </div>
        </header>

        <section className="mt-10 grid gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700 md:mt-12 md:grid-cols-3">
          <article className="rounded-2xl border border-emerald-100/20 bg-emerald-100/10 p-5 backdrop-blur-sm">
            <SparklesIcon className="h-5 w-5 text-emerald-300" />
            <h2 className="mt-3 text-lg font-medium text-emerald-50">Right agent, right task</h2>
            <p className="mt-2 text-sm leading-relaxed text-emerald-100/75">
              Leaf scores prompt complexity and selects the best-fit model so quality stays high without defaulting to heavyweight compute.
            </p>
          </article>

          <article className="rounded-2xl border border-emerald-100/20 bg-emerald-100/10 p-5 backdrop-blur-sm">
            <MapPinnedIcon className="h-5 w-5 text-emerald-300" />
            <h2 className="mt-3 text-lg font-medium text-emerald-50">Eco-aware datacenter routing</h2>
            <p className="mt-2 text-sm leading-relaxed text-emerald-100/75">
              Requests are directed toward datacenters with cleaner grid intensity when possible, reducing emissions behind each response.
            </p>
          </article>

          <article className="rounded-2xl border border-emerald-100/20 bg-emerald-100/10 p-5 backdrop-blur-sm">
            <LeafIcon className="h-5 w-5 text-emerald-300" />
            <h2 className="mt-3 text-lg font-medium text-emerald-50">Transparent carbon outcomes</h2>
            <p className="mt-2 text-sm leading-relaxed text-emerald-100/75">
              See how Leaf's orchestration lowers carbon footprint versus one-size-fits-all model usage while still delivering robust answers.
            </p>
          </article>
        </section>

        <section className="mt-8 animate-in fade-in slide-in-from-bottom-3 duration-700">
          <div className="rounded-2xl border border-emerald-100/25 bg-black/25 p-5 backdrop-blur-sm sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
            <div>
              <p className="text-lg font-semibold tracking-tight text-emerald-50">Start building with Leaf</p>
              <p className="mt-1 text-sm text-emerald-100/75">
                Sign in with GitHub to access Leaf's chat orchestration, live routing visuals, and carbon-aware insights.
              </p>
            </div>

            <div className="mt-4 sm:mt-0">
              <Button
                className="h-11 w-full gap-2 rounded-full bg-emerald-300 px-6 font-medium text-emerald-950 hover:bg-emerald-200 sm:w-auto"
                onClick={() => signIn("github", { callbackUrl: "/chat" })}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                Continue with GitHub
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        <footer className="mt-6 pb-1 text-xs tracking-wide text-emerald-100/65 sm:mt-10">
          Leaf is built for efficient inference, greener infrastructure, and better AI outcomes.
        </footer>
      </div>
    </main>
  );
}
