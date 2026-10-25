"use client";

import { createPortal } from "react-dom";
import type { ComponentProps } from "react";

/** Keep dialogs above the shell's isolated workspace and floating controls. */
export function ModalOverlay(props: ComponentProps<"div">) {
  return typeof document === "undefined" ? null : createPortal(<div {...props} />, document.body);
}
