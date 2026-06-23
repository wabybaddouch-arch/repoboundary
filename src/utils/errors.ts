export class RepoBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepoBoundaryError";
  }
}
