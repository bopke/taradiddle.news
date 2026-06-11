import { notFound } from "next/navigation";

/** Routes any unknown public path to the localized, in-character 404. */
export default function CatchAll(): never {
  notFound();
}
