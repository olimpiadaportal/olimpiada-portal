import { cookies } from "next/headers";
import { messages } from "./messages";
import { defaultLocale, locales, type Locale } from "./config";

export type T = (key: string) => string;

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const v = store.get("locale")?.value;
  return v && (locales as readonly string[]).includes(v)
    ? (v as Locale)
    : defaultLocale;
}

export async function getT(): Promise<T> {
  const locale = await getLocale();
  const dict = messages[locale];
  const fallback = messages[defaultLocale];
  return (key: string) => dict[key] ?? fallback[key] ?? key;
}
