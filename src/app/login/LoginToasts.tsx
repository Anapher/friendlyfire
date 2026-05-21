"use client";

import { useEffect, useRef } from "react";
import { useToast } from "../_ui/Toast";

type LoginToastsProps = {
  sent?: string;
  error?: string;
};

export function LoginToasts({ sent, error }: LoginToastsProps) {
  const { showToast } = useToast();
  const fired = useRef<string | null>(null);
  const signature = `${sent ?? ""}|${error ?? ""}`;

  useEffect(() => {
    if (fired.current === signature) {
      return;
    }
    fired.current = signature;
    if (sent) {
      showToast({
        tone: "success",
        title: "Login link sent",
        description: "Check your inbox for the magic link.",
      });
    }
    if (error) {
      showToast({
        tone: "danger",
        title: "Login link invalid",
        description: "Request a new one — the previous link expired or was already used.",
      });
    }
  }, [signature, sent, error, showToast]);

  return null;
}
