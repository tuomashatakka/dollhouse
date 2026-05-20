import { existsSync, statSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import simpleGit from "simple-git";

export interface WorkspaceState {
  path: string;
  isGit: boolean;
}

export class WorkspaceManager {
  private current: WorkspaceState | null = null;

  get(): WorkspaceState | null {
    return this.current;
  }

  /**
   * Set the active workspace. If `isGit` is true and `pathOrUrl` looks like a
   * git URL (https://, git@, git://), clones to a temp dir; otherwise uses the
   * absolute local path.
   */
  async set(pathOrUrl: string, isGit: boolean): Promise<WorkspaceState> {
    if (isGit && isUrl(pathOrUrl)) {
      const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "dollhouse-ws-"));
      await mkdir(tmpRoot, { recursive: true });
      await simpleGit().clone(pathOrUrl, tmpRoot);
      this.current = { path: tmpRoot, isGit: true };
      return this.current;
    }

    const abs = path.resolve(pathOrUrl);
    if (!existsSync(abs)) {
      throw new Error(`Workspace path does not exist: ${abs}`);
    }
    if (!statSync(abs).isDirectory()) {
      throw new Error(`Workspace path is not a directory: ${abs}`);
    }
    this.current = { path: abs, isGit };
    return this.current;
  }
}

function isUrl(s: string): boolean {
  return /^(https?:\/\/|git@|git:\/\/|ssh:\/\/)/.test(s);
}
