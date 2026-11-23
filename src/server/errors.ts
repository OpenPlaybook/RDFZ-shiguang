export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
