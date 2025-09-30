import ansiEscapes from "ansi-escapes";
import logUpdate from "log-update";
import wrapAnsi from "wrap-ansi";
import stringWidth from "string-width";

type NullableString = string | null | undefined;

function now() {
  return Date.now();
}

function termWidth(): number {
  const w = (process.stdout as any)?.columns ?? 80;
  return Math.max(20, Number(w) || 80);
}

function clampWidth(line: string, width: number): string {
  if (width <= 0) return "";
  const wrapped = wrapAnsi(line, width, { trim: false, hard: false });
  return wrapped;
}

function framesEqual(a: string, b: string): boolean {
  return a === b;
}

export class Screen {
  private top: string = "";
  private journalLines: string[] = [];
  private status: string = "";
  private lastFrame: string = "";
  private rafTimer: NodeJS.Timeout | null = null;
  private readonly fpsInterval: number;
  private lastRenderTs = 0;
  private disposed = false;

  constructor(private out: NodeJS.WriteStream = process.stdout, fps: number = 12) {
    this.fpsInterval = Math.max(1, Math.round(1000 / Math.min(15, Math.max(1, fps))));
  }

  setTop(s: NullableString) {
    this.top = (s ?? "").toString();
    this.requestRender();
  }

  appendToJournal(s: NullableString) {
    const text = (s ?? "").toString();
    if (!text) return;
    for (const line of text.split(/\r?\n/)) this.journalLines.push(line);
    this.requestRender();
  }

  replaceLastJournalLine(s: NullableString) {
    const text = (s ?? "").toString();
    if (!this.journalLines.length) {
      this.journalLines.push(text);
    } else {
      this.journalLines[this.journalLines.length - 1] = text;
    }
    this.requestRender();
  }

  setStatus(s: NullableString) {
    this.status = (s ?? "").toString();
    this.requestRender();
  }

  private buildFrame(): string {
    const width = termWidth();
    const top = clampWidth(this.top, width);
    const journal = this.journalLines.map((l) => clampWidth(l, width)).join("\n");
    const status = clampWidth(this.status, width);

    // Layout: top (once), journal (grows), and a blank line reserved for status under input.
    // We render top + journal; status is meant to be re-rendered below prompt via sticky technique.
    // However, logUpdate draws a single area. We'll include status at bottom as part of live region.
    const frame = [top, journal, status].filter(Boolean).join("\n");
    return frame;
  }

  private requestRender() {
    if (this.disposed) return;
    const ts = now();
    if (this.rafTimer) return; // coalesce
    const delay = Math.max(0, this.fpsInterval - (ts - this.lastRenderTs));
    this.rafTimer = setTimeout(() => {
      this.rafTimer = null;
      this.lastRenderTs = now();
      const frame = this.buildFrame();
      if (framesEqual(frame, this.lastFrame)) return; // dedupe
      this.lastFrame = frame;
      if (this.out.isTTY) {
        logUpdate(frame);
      } else {
        // Non-TTY: print once without ANSI
        this.out.write(frame + "\n");
      }
    }, delay);
  }

  /**
   * Sticky footer: render a single line directly beneath the current prompt input.
   * This preserves the user cursor position.
   */
  renderStickyFooter(line: string) {
    if (!this.out.isTTY) return; // no-op when not a TTY
    const width = termWidth();
    const text = clampWidth(line, width);
    this.out.write(
      ansiEscapes.cursorSavePosition +
        ansiEscapes.cursorHide +
        ansiEscapes.cursorTo(0, (this as any).currentPromptRow ?? undefined) +
        "\n" +
        ansiEscapes.eraseEndLine +
        text +
        ansiEscapes.cursorRestorePosition +
        ansiEscapes.cursorShow,
    );
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafTimer) clearTimeout(this.rafTimer);
    this.rafTimer = null;
    if (this.out.isTTY) {
      logUpdate.clear();
      logUpdate.done();
    }
  }
}


