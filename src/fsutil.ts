import { constants } from "node:fs";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Returns whether a filesystem path exists and is accessible.
 */
export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads a UTF-8 JSON file and parses it as type T.
 */
export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

/**
 * Writes a value as pretty-printed JSON, creating parent directories as needed.
 */
export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Copies a file to a destination path, creating parent directories as needed.
 */
export async function copyFileTo(src: string, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest);
}

/**
 * Removes a file or directory tree if it exists.
 */
export async function removePath(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true });
}
