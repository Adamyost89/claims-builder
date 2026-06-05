import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve, sep } from "node:path";

import { env } from "@/lib/env";

export type StoredFile = {
  storageKey: string;
  absolutePath: string;
  size: number;
};

export class StoragePathError extends Error {
  constructor(message = "Invalid storage path") {
    super(message);
    this.name = "StoragePathError";
  }
}

export class StorageUnavailableError extends Error {
  constructor(message = "Storage directory is not writable") {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

function resolveStorageRoot(): string {
  return resolve(env.STORAGE_DIR);
}

function resolveSafeStoragePath(storageKey: string): string {
  if (storageKey.includes("..") || storageKey.startsWith("/") || storageKey.startsWith("\\")) {
    throw new StoragePathError("Path traversal blocked.");
  }
  const root = resolveStorageRoot();
  const absolutePath = resolve(root, storageKey);
  const withinRoot =
    absolutePath === root || absolutePath.startsWith(`${root}${sep}`);
  if (!withinRoot) {
    throw new StoragePathError("Path traversal blocked.");
  }
  return absolutePath;
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export function buildClaimStorageKey(claimId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique = `${Date.now()}-${safeName}`;
  return ["claims", claimId, unique].join("/");
}

export async function validateStorageDir(): Promise<string> {
  const root = resolveStorageRoot();
  await ensureDir(root);
  return root;
}

export async function ensureStorageReady(): Promise<string> {
  const root = await validateStorageDir();
  const probePath = resolve(root, ".storage-write-probe");
  try {
    await writeFile(probePath, "ok", { flag: "w" });
    await unlink(probePath);
    await access(root, constants.W_OK);
  } catch {
    throw new StorageUnavailableError(
      `STORAGE_DIR is not writable: ${root}`,
    );
  }
  return root;
}

export async function saveClaimFile(input: {
  claimId: string;
  fileName: string;
  buffer: Buffer;
}): Promise<StoredFile> {
  const root = await validateStorageDir();
  const storageKey = buildClaimStorageKey(input.claimId, input.fileName);
  const absolutePath = resolveSafeStoragePath(storageKey);
  await ensureDir(dirname(absolutePath));
  await writeFile(absolutePath, input.buffer);

  return {
    storageKey,
    absolutePath,
    size: input.buffer.length,
  };
}

export async function readClaimFile(storageKey: string): Promise<Buffer> {
  const absolutePath = resolveSafeStoragePath(storageKey);
  return readFile(absolutePath);
}

export async function deleteClaimFile(storageKey: string): Promise<void> {
  const absolutePath = resolveSafeStoragePath(storageKey);
  try {
    await unlink(absolutePath);
  } catch {
    // File may already be removed; deletion is best-effort for storage cleanup.
  }
}

export function getClaimFilePath(storageKey: string): string {
  return resolveSafeStoragePath(storageKey);
}
