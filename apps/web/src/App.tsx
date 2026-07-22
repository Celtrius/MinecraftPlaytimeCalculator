import { useEffect, useMemo, useRef, useState } from "react"
import {
  RiArrowRightLine,
  RiCalendarCheckLine,
  RiCheckboxCircleFill,
  RiErrorWarningLine,
  RiFileList3Line,
  RiFolderOpenLine,
  RiGamepadLine,
  RiRefreshLine,
  RiShieldCheckLine,
  RiTimeLine,
  RiUploadCloud2Line,
} from "@remixicon/react"

import { Button } from "@workspace/ui/components/button"

import {
  analyzeLogFiles,
  type AnalysisResult,
  type PlaySession,
} from "@/lib/minecraft-logs"

type AnalysisStatus = "idle" | "reading" | "ready" | "error"

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
})

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
})

function formatDuration(milliseconds: number, compact = false) {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) {
    return compact ? `${minutes}m` : `${minutes} min`
  }

  if (minutes === 0) {
    return compact ? `${hours}h` : `${hours} hr`
  }

  return compact ? `${hours}h ${minutes}m` : `${hours} hr ${minutes} min`
}

function dateKey(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function folderNameFromFiles(files: File[]) {
  const relativePath = files.find(
    (file) => file.webkitRelativePath
  )?.webkitRelativePath
  return relativePath?.split("/")[0] ?? `${files.length} selected files`
}

function SessionRow({ session }: { session: PlaySession }) {
  const start = new Date(session.start)
  const end = new Date(session.end)

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b py-4 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{dateFormatter.format(start)}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {timeFormatter.format(start)}–{timeFormatter.format(end)} ·{" "}
          {session.source}
        </p>
      </div>
      <span className="font-mono text-sm font-semibold tabular-nums">
        {formatDuration(session.duration, true)}
      </span>
    </li>
  )
}

export function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const resultSectionRef = useRef<HTMLElement>(null)
  const runIdRef = useRef(0)
  const [status, setStatus] = useState<AnalysisStatus>("idle")
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [folderName, setFolderName] = useState("")
  const [error, setError] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (status !== "ready" || !result) {
      return
    }

    const animationFrame = requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches

      resultSectionRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      })
    })

    return () => cancelAnimationFrame(animationFrame)
  }, [result, status])

  const summary = useMemo(() => {
    if (!result || result.sessions.length === 0) {
      return null
    }

    const total = result.sessions.reduce(
      (sum, session) => sum + session.duration,
      0
    )
    const longest = Math.max(
      ...result.sessions.map((session) => session.duration)
    )
    const activeDays = new Set(
      result.sessions.map((session) => dateKey(session.start))
    ).size
    const sessionsByDay = new Map<string, number>()

    for (const session of result.sessions) {
      const key = dateKey(session.start)
      sessionsByDay.set(key, (sessionsByDay.get(key) ?? 0) + session.duration)
    }

    const activity = [...sessionsByDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
    const maxActivity = Math.max(...activity.map(([, duration]) => duration))

    return {
      total,
      longest,
      activeDays,
      average: total / result.sessions.length,
      first: result.sessions[0],
      last: result.sessions.at(-1)!,
      activity,
      maxActivity,
    }
  }, [result])

  const selectFolder = () => inputRef.current?.click()

  const runAnalysis = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) {
      return
    }

    const runId = runIdRef.current + 1
    runIdRef.current = runId
    setFolderName(folderNameFromFiles(selectedFiles))
    setStatus("reading")
    setProgress(0)
    setError("")
    setResult(null)
    setShowAll(false)

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    try {
      const analysis = await analyzeLogFiles(
        selectedFiles,
        (completed, total) => {
          if (runId === runIdRef.current) {
            setProgress(Math.round((completed / total) * 100))
          }
        }
      )

      if (runId !== runIdRef.current) {
        return
      }

      setResult(analysis)
      setStatus("ready")
    } catch (caughtError) {
      if (runId !== runIdRef.current) {
        return
      }

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while reading the logs."
      )
      setStatus("error")
    }
  }

  const visibleSessions = result
    ? [...result.sessions].reverse().slice(0, showAll ? undefined : 5)
    : []

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <RiGamepadLine className="size-4.5" aria-hidden="true" />
            </div>
            <span className="text-sm font-bold tracking-tight">Blocktime</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <RiShieldCheckLine
              className="size-4 text-primary"
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Private by design</span>
            <span className="sm:hidden">Private</span>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto flex max-w-5xl flex-col items-center px-5 pt-16 pb-16 text-center sm:px-8 sm:pt-24">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-xs">
            <span className="size-1.5 rounded-full bg-primary" />
            Minecraft playtime, from your own logs
          </div>
          <h1 className="max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.045em] text-balance sm:text-6xl">
            Find out how long you&apos;ve really played.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-pretty text-muted-foreground sm:text-base">
            Choose your Minecraft logs folder. Blocktime reads the session
            markers, adds everything up, and keeps every file on your device.
          </p>

          <div className="mt-10 w-full max-w-3xl">
            <input
              ref={(node) => {
                inputRef.current = node
                node?.setAttribute("webkitdirectory", "")
                node?.setAttribute("directory", "")
              }}
              className="sr-only"
              type="file"
              multiple
              accept=".log,.gz,text/plain,application/gzip"
              onChange={(event) => {
                void runAnalysis(Array.from(event.target.files ?? []))
                event.target.value = ""
              }}
            />

            <div
              className={`relative overflow-hidden rounded-3xl border bg-card p-3 text-left shadow-[0_16px_60px_-36px_rgba(23,36,24,0.35)] transition-all ${
                isDragging
                  ? "border-primary ring-4 ring-primary/10"
                  : "border-border"
              }`}
              onDragEnter={(event) => {
                event.preventDefault()
                setIsDragging(true)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (
                  !event.currentTarget.contains(event.relatedTarget as Node)
                ) {
                  setIsDragging(false)
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                setIsDragging(false)
                void runAnalysis(Array.from(event.dataTransfer.files))
              }}
            >
              <div className="rounded-[1.1rem] border border-dashed bg-muted/35 px-5 py-9 text-center sm:px-10 sm:py-12">
                {status === "reading" ? (
                  <>
                    <div className="mx-auto grid size-12 place-items-center rounded-2xl border bg-background text-primary shadow-sm">
                      <RiRefreshLine
                        className="size-5 animate-spin"
                        aria-hidden="true"
                      />
                    </div>
                    <h2 className="mt-5 text-base font-semibold">
                      Reading {folderName}
                    </h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      Looking for play sessions across your logs…
                    </p>
                    <div className="mx-auto mt-6 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      {progress}%
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mx-auto grid size-12 place-items-center rounded-2xl border bg-background text-primary shadow-sm">
                      <RiFolderOpenLine className="size-5" aria-hidden="true" />
                    </div>
                    <h2 className="mt-5 text-base font-semibold">
                      {status === "ready"
                        ? "Analyze another folder"
                        : "Choose your logs folder"}
                    </h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      Usually found at{" "}
                      <span className="font-mono">.minecraft/logs</span>
                    </p>
                    <Button
                      className="mt-6 h-11 px-5"
                      size="lg"
                      onClick={selectFolder}
                    >
                      <RiUploadCloud2Line data-icon="inline-start" />
                      Select logs folder
                      <RiArrowRightLine data-icon="inline-end" />
                    </Button>
                    <p className="mt-3 text-xs text-muted-foreground">
                      or drop the folder here · .log and .log.gz
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <RiShieldCheckLine
                className="size-4 text-primary"
                aria-hidden="true"
              />
              Your logs are processed locally and never uploaded.
            </div>

            {status === "error" && (
              <div
                className="mt-5 flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-left"
                role="alert"
              >
                <RiErrorWarningLine className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div>
                  <p className="text-sm font-semibold">
                    Couldn&apos;t calculate playtime
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {error}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {status === "ready" && result && (
          <section
            ref={resultSectionRef}
            className="scroll-mt-4 border-y bg-muted/25 px-5 py-16 sm:px-8"
            aria-live="polite"
          >
            <div className="mx-auto max-w-5xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <RiCheckboxCircleFill className="size-4.5" />
                    Analysis complete
                  </div>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                    Your playtime
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  {result.scannedFiles} log{" "}
                  {result.scannedFiles === 1 ? "file" : "files"} read
                  {result.failedFiles > 0 && ` · ${result.failedFiles} skipped`}
                </p>
              </div>

              {summary ? (
                <>
                  <div className="mt-8 grid overflow-hidden rounded-3xl border bg-card shadow-sm lg:grid-cols-[1.25fr_1fr]">
                    <div className="flex flex-col justify-between border-b p-6 sm:p-8 lg:border-r lg:border-b-0">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Total time played
                        </p>
                        <p className="mt-2 font-mono text-5xl font-semibold tracking-[-0.06em] tabular-nums sm:text-7xl">
                          {formatDuration(summary.total, true)}
                        </p>
                        <p className="mt-3 text-sm text-muted-foreground">
                          Across {result.sessions.length} detected{" "}
                          {result.sessions.length === 1
                            ? "session"
                            : "sessions"}
                        </p>
                      </div>
                      <p className="mt-10 text-xs text-muted-foreground">
                        {dateFormatter.format(new Date(summary.first.start))} –{" "}
                        {dateFormatter.format(new Date(summary.last.end))}
                      </p>
                    </div>

                    <div className="grid grid-cols-2">
                      {[
                        {
                          label: "Sessions",
                          value: String(result.sessions.length),
                          icon: RiFileList3Line,
                        },
                        {
                          label: "Active days",
                          value: String(summary.activeDays),
                          icon: RiCalendarCheckLine,
                        },
                        {
                          label: "Avg. session",
                          value: formatDuration(summary.average, true),
                          icon: RiTimeLine,
                        },
                        {
                          label: "Longest",
                          value: formatDuration(summary.longest, true),
                          icon: RiGamepadLine,
                        },
                      ].map((stat, index) => (
                        <div
                          className={`p-5 sm:p-6 ${index % 2 === 0 ? "border-r" : ""} ${index < 2 ? "border-b" : ""}`}
                          key={stat.label}
                        >
                          <stat.icon className="size-4 text-primary" />
                          <p className="mt-6 font-mono text-xl font-semibold tabular-nums sm:text-2xl">
                            {stat.value}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {stat.label}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.15fr]">
                    <div className="rounded-3xl border bg-card p-6 shadow-sm sm:p-7">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold">
                            Recent activity
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Last {summary.activity.length} active days
                          </p>
                        </div>
                        <RiCalendarCheckLine className="size-4 text-muted-foreground" />
                      </div>
                      <div
                        className="mt-8 flex h-36 items-end gap-2"
                        aria-label="Playtime by active day"
                      >
                        {summary.activity.map(([day, duration]) => (
                          <div
                            className="group flex h-full min-w-0 flex-1 items-end"
                            key={day}
                            title={`${dateFormatter.format(new Date(`${day}T12:00:00`))}: ${formatDuration(duration)}`}
                          >
                            <div
                              className="w-full rounded-md bg-primary/20 transition-colors group-hover:bg-primary"
                              style={{
                                height: `${Math.max(8, (duration / summary.maxActivity) * 100)}%`,
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex justify-between text-[10px] text-muted-foreground">
                        <span>{summary.activity[0]?.[0].slice(5)}</span>
                        <span>{summary.activity.at(-1)?.[0].slice(5)}</span>
                      </div>
                    </div>

                    <div className="rounded-3xl border bg-card p-6 shadow-sm sm:p-7">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-sm font-semibold">
                            Play sessions
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Most recent first
                          </p>
                        </div>
                        {result.sessions.length > 5 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowAll((current) => !current)}
                          >
                            {showAll ? "Show less" : "View all"}
                          </Button>
                        )}
                      </div>
                      <ul className="mt-3">
                        {visibleSessions.map((session) => (
                          <SessionRow
                            key={`${session.start}-${session.end}`}
                            session={session}
                          />
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-8 rounded-3xl border bg-card p-8 text-center shadow-sm">
                  <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
                    <RiTimeLine className="size-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">
                    No play sessions found
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    The files were readable, but they didn&apos;t contain
                    recognizable world or server connection markers. Try
                    selecting the main Minecraft logs folder.
                  </p>
                  <Button
                    className="mt-5"
                    variant="outline"
                    onClick={selectFolder}
                  >
                    <RiRefreshLine data-icon="inline-start" />
                    Choose another folder
                  </Button>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-8 sm:grid-cols-3 sm:gap-6">
            {[
              {
                number: "01",
                title: "Pick the logs folder",
                text: "Choose the logs directory inside your Minecraft installation.",
              },
              {
                number: "02",
                title: "We find the sessions",
                text: "Current and compressed archive logs are read directly in your browser.",
              },
              {
                number: "03",
                title: "See your total",
                text: "Overlapping records are cleaned up before your playtime is added together.",
              },
            ].map((step) => (
              <div className="border-t pt-5" key={step.number}>
                <p className="font-mono text-xs font-semibold text-primary">
                  {step.number}
                </p>
                <h2 className="mt-5 text-sm font-semibold">{step.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Blocktime · Your Minecraft history, calculated locally.</p>
          <p>No account. No upload. No tracking.</p>
        </div>
      </footer>
    </div>
  )
}
