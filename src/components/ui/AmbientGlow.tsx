import React, { memo, type ReactNode } from "react";
import { AmbientArtworkCanvas } from "@/ui/glass/AmbientArtworkCanvas";

/**
 * Legacy AmbientGlow bridge: delegates to the static GPU-cached
 * AmbientArtworkCanvas with zero continuous animation loops and zero purple.
 */
export const AmbientGlow = memo(function AmbientGlow({
  imageUri,
  children,
}: {
  imageUri?: string | null;
  children?: ReactNode;
}) {
  return (
    <>
      <AmbientArtworkCanvas imageUri={imageUri} intensity="subtle" />
      {children}
    </>
  );
});
