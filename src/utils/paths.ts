export function toPosixPath(filePath: string): string {
  return filePath
    .replace(/\\/g, "/")
    .replace(/^\.\/+/u, "")
    .replace(/\/+/g, "/");
}
