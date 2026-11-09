export class CardFaceLru<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly limit: number, private readonly evict?: (value: T) => void) {}

  take(key: string): T | undefined {
    const value = this.entries.get(key);
    this.entries.delete(key);
    return value;
  }

  get(key: string): T | undefined {
    const value = this.take(key);
    if (value !== undefined) this.entries.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value!;
      const removed = this.take(oldest)!;
      this.evict?.(removed);
    }
  }
}

interface Job<T> {
  promise: Promise<T | null>;
  resolve: (value: T | null) => void;
  background: boolean;
  started: boolean;
}

export class CardFaceLoadQueue<T> {
  private readonly pending = new Map<string, Job<T>>();
  private readonly warmed = new Set<string>();
  private readonly failedUntil = new Map<string, number>();
  private readonly decoded: CardFaceLru<T>;
  private active = 0;
  private backgroundActive = 0;

  constructor(private readonly decode: (url: string) => Promise<T | null>, decodedLimit = 12,
    private readonly concurrency = 6, private readonly backgroundLimit = 4) {
    this.decoded = new CardFaceLru(decodedLimit);
  }

  load(url: string, background = false): Promise<T | null> {
    const cached = this.decoded.get(url);
    if (cached !== undefined) return Promise.resolve(cached);
    const existing = this.pending.get(url);
    if (existing) {
      if (!background) existing.background = false;
      this.pump();
      return existing.promise;
    }
    if ((this.failedUntil.get(url) ?? 0) > Date.now() || (background && this.warmed.has(url))) return Promise.resolve(null);

    let resolve!: Job<T>['resolve'];
    const promise = new Promise<T | null>(done => { resolve = done; });
    this.pending.set(url, { promise, resolve, background, started: false });
    this.pump();
    return promise;
  }

  clearBackground(): void {
    for (const [url, job] of this.pending) {
      if (!job.started && job.background) {
        this.pending.delete(url);
        job.resolve(null);
      }
    }
  }

  private pump(): void {
    while (this.active < this.concurrency) {
      const waiting = [...this.pending].filter(([, job]) => !job.started);
      const entry = waiting.find(([, job]) => !job.background)
        ?? (this.backgroundActive < this.backgroundLimit ? waiting[0] : undefined);
      if (!entry) return;
      const [url, job] = entry;
      job.started = true;
      const background = job.background;
      this.active++;
      if (background) this.backgroundActive++;
      void this.run(url, job, background);
    }
  }

  private async run(url: string, job: Job<T>, background: boolean): Promise<void> {
    const value = await Promise.resolve().then(() => this.decode(url)).catch(() => null);
    if (value !== null) {
      this.decoded.set(url, value);
      this.warmed.add(url);
      this.failedUntil.delete(url);
    } else {
      // Chặn vòng lặp yêu cầu khi một URL lỗi liên tục.
      this.failedUntil.set(url, Date.now() + 15_000);
    }
    this.pending.delete(url);
    this.active--;
    if (background) this.backgroundActive--;
    job.resolve(value);
    this.pump();
  }
}
