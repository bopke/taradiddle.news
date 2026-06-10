import { toNextJsHandler } from "better-auth/next-js";
import { getRequestContext } from "@/lib/request-context";

async function handler(request: Request): Promise<Response> {
  const { auth } = await getRequestContext();
  return auth.handler(request);
}

export const { GET, POST } = toNextJsHandler(handler);
