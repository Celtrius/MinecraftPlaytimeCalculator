export type PlaySession = {
  start: number
  end: number
  duration: number
  source: string
}

export type AnalysisResult = {
  sessions: PlaySession[]
  scannedFiles: number
  skippedFiles: number
  failedFiles: number
}

type ParsedTimestamp = {
  seconds: number
  date?: Date
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

const SESSION_START_PATTERNS = [
  /\[(?:Render|Client) thread\/INFO\].*\bConnecting to\b/i,
  /\[(?:Render|Client) thread\/INFO\]:.*\bConnecting to\b/i,
  /Starting integrated minecraft server version/i,
  /logged in with entity id/i,
  /Preparing level ["']/i,
]

const SESSION_END_PATTERNS = [
  /Stopping worker threads/i,
  /\[Server thread\/INFO\].*Stopping server/i,
  /\[(?:Render|Client) thread\/INFO\].*Stopping!/i,
  /Disconnecting from server/i,
  /Disconnected from server/i,
  /Connection (?:closed|lost)/i,
  /Lost connection:/i,
]

function matchesAny(line: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(line))
}

function parseTimestamp(line: string): ParsedTimestamp | null {
  const iso = line.match(
    /^\[?(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2}):(\d{2})(?:[.,]\d+)?/
  )

  if (iso) {
    const [, year, month, day, hour, minute, second] = iso
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )

    return {
      seconds: Number(hour) * 3600 + Number(minute) * 60 + Number(second),
      date,
    }
  }

  const forge = line.match(
    /^\[(\d{1,2})([A-Za-z]{3})(\d{4}) (\d{1,2}):(\d{2}):(\d{2})(?:[.,]\d+)?\]/
  )

  if (forge) {
    const [, day, monthName, year, hour, minute, second] = forge
    const month = MONTHS[monthName.toLowerCase()]

    if (month !== undefined) {
      const date = new Date(
        Number(year),
        month,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      )

      return {
        seconds: Number(hour) * 3600 + Number(minute) * 60 + Number(second),
        date,
      }
    }
  }

  const standard = line.match(/^\[(\d{1,2}):(\d{2}):(\d{2})(?:[.,]\d+)?\]/)

  if (!standard) {
    return null
  }

  const [, hour, minute, second] = standard
  return {
    seconds: Number(hour) * 3600 + Number(minute) * 60 + Number(second),
  }
}

function baseDateForFile(file: File) {
  const path = file.webkitRelativePath || file.name
  const datedName = path.match(/(\d{4})-(\d{2})-(\d{2})/)

  if (datedName) {
    const [, year, month, day] = datedName
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  const modified = file.lastModified ? new Date(file.lastModified) : new Date()
  return new Date(
    modified.getFullYear(),
    modified.getMonth(),
    modified.getDate()
  )
}

function timestampOnDate(baseDate: Date, seconds: number, dayOffset: number) {
  const date = new Date(baseDate)
  date.setDate(date.getDate() + dayOffset)
  date.setHours(0, 0, 0, 0)
  return date.getTime() + seconds * 1000
}

function parseSessions(text: string, file: File) {
  const sessions: PlaySession[] = []
  const baseDate = baseDateForFile(file)
  const source = file.webkitRelativePath || file.name
  let activeStart: number | null = null
  let latestTimestamp: number | null = null
  let previousSeconds: number | null = null
  let dayOffset = 0

  for (const line of text.split(/\r?\n/)) {
    const parsed = parseTimestamp(line)
    if (!parsed) {
      continue
    }

    if (
      !parsed.date &&
      previousSeconds !== null &&
      parsed.seconds < previousSeconds - 12 * 60 * 60
    ) {
      dayOffset += 1
    }

    previousSeconds = parsed.seconds
    const timestamp =
      parsed.date?.getTime() ??
      timestampOnDate(baseDate, parsed.seconds, dayOffset)
    latestTimestamp = timestamp

    if (activeStart === null && matchesAny(line, SESSION_START_PATTERNS)) {
      activeStart = timestamp
      continue
    }

    if (activeStart !== null && matchesAny(line, SESSION_END_PATTERNS)) {
      if (timestamp > activeStart) {
        sessions.push({
          start: activeStart,
          end: timestamp,
          duration: timestamp - activeStart,
          source,
        })
      }
      activeStart = null
    }
  }

  if (
    activeStart !== null &&
    latestTimestamp !== null &&
    latestTimestamp > activeStart
  ) {
    sessions.push({
      start: activeStart,
      end: latestTimestamp,
      duration: latestTimestamp - activeStart,
      source,
    })
  }

  return sessions
}

function mergeOverlappingSessions(sessions: PlaySession[]) {
  const sorted = [...sessions].sort((a, b) => a.start - b.start)
  const merged: PlaySession[] = []

  for (const session of sorted) {
    const previous = merged.at(-1)

    if (!previous || session.start >= previous.end) {
      merged.push({ ...session })
      continue
    }

    previous.end = Math.max(previous.end, session.end)
    previous.duration = previous.end - previous.start
    if (previous.source !== session.source) {
      previous.source = "Multiple log files"
    }
  }

  return merged
}

async function readLogFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".gz")) {
    return file.text()
  }

  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot read compressed log files.")
  }

  const decompressed = file
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
  return new Response(decompressed).text()
}

export async function analyzeLogFiles(
  files: File[],
  onProgress?: (completed: number, total: number) => void
): Promise<AnalysisResult> {
  const logFiles = files.filter((file) => /\.log(?:\.gz)?$/i.test(file.name))

  if (logFiles.length === 0) {
    throw new Error("No Minecraft .log or .log.gz files were found.")
  }

  const sessions: PlaySession[] = []
  let failedFiles = 0

  for (const [index, file] of logFiles.entries()) {
    try {
      const text = await readLogFile(file)
      sessions.push(...parseSessions(text, file))
    } catch {
      failedFiles += 1
    }

    onProgress?.(index + 1, logFiles.length)
  }

  if (failedFiles === logFiles.length) {
    throw new Error("The log files could not be read in this browser.")
  }

  return {
    sessions: mergeOverlappingSessions(sessions),
    scannedFiles: logFiles.length,
    skippedFiles: files.length - logFiles.length,
    failedFiles,
  }
}
