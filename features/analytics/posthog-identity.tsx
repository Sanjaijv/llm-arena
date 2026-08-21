"use client";

import { useUser } from "@clerk/nextjs";
import posthog from "posthog-js";
import { useEffect } from "react";

export function PostHogIdentity() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (isSignedIn) {
      posthog.identify(user.id);
      return;
    }

    posthog.reset();
  }, [isLoaded, isSignedIn, user]);

  return null;
}
