export const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
export function appUrl(value: string) {
  return value.startsWith("/") && !value.startsWith("//")
    ? basePath + value
    : value;
}
