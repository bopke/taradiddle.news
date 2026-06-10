"use client";

import { createAuthClient } from "better-auth/react";

/** Browser-side auth client; same-origin base URL. */
export const authClient = createAuthClient();
