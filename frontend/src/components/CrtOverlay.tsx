'use client';

// Ambient CRT layer: faint scanlines + occasional brightness dip.
// Sits above content but below modals. Pure CSS, GPU-cheap.

export function CrtOverlay() {
  return (
    <>
      <div className="crt-scan" aria-hidden />
      <div className="crt-flicker" aria-hidden />
      <div className="crt-vignette" aria-hidden />
    </>
  );
}

export default CrtOverlay;
