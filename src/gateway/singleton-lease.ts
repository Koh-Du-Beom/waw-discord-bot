import { open, readFile, unlink, type FileHandle } from "node:fs/promises";

export type SingletonLease = {
  claim(ownerId: string): Promise<boolean>;
  release(ownerId: string): Promise<boolean>;
};

type LeaseRecord = {
  ownerId: string;
  pid: number;
};

export class FileSingletonLease implements SingletonLease {
  private readonly path: string;
  private readonly pid: number;
  private readonly isProcessAlive: (pid: number) => boolean;
  private handle: FileHandle | undefined;
  private ownerId: string | undefined;

  constructor(
    path: string,
    pid: number,
    isProcessAlive: (pid: number) => boolean = defaultProcessAlive,
  ) {
    this.path = path;
    this.pid = pid;
    this.isProcessAlive = isProcessAlive;
  }

  async claim(ownerId: string): Promise<boolean> {
    if (this.handle !== undefined) {
      return false;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(this.path, "wx", 0o600);
        await handle.writeFile(JSON.stringify({ ownerId, pid: this.pid } satisfies LeaseRecord));
        this.handle = handle;
        this.ownerId = ownerId;
        return true;
      } catch (error) {
        if (!isAlreadyExists(error)) {
          throw error;
        }
        const stale = await this.isStale();
        if (!stale) {
          return false;
        }
        await unlink(this.path).catch((unlinkError: unknown) => {
          if (!isMissing(unlinkError)) {
            throw unlinkError;
          }
        });
      }
    }
    return false;
  }

  async release(ownerId: string): Promise<boolean> {
    if (this.handle === undefined || this.ownerId !== ownerId) {
      return false;
    }
    const handle = this.handle;
    this.handle = undefined;
    this.ownerId = undefined;
    await handle.close();
    await unlink(this.path).catch((error: unknown) => {
      if (!isMissing(error)) {
        throw error;
      }
    });
    return true;
  }

  private async isStale(): Promise<boolean> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as Partial<LeaseRecord>;
      return typeof parsed.pid !== "number" || !this.isProcessAlive(parsed.pid);
    } catch {
      return false;
    }
  }
}

function defaultProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isNoSuchProcess(error) ? false : true;
  }
}

function isAlreadyExists(error: unknown): boolean {
  return errorCode(error) === "EEXIST";
}

function isMissing(error: unknown): boolean {
  return errorCode(error) === "ENOENT";
}

function isNoSuchProcess(error: unknown): boolean {
  return errorCode(error) === "ESRCH";
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}
