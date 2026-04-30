'use client';

// Sweep + label overlay on every pathname change. ~360ms, then gone.
// Skips on the very first paint so it doesn't fight BootSequence.

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function RouteTransition() {
  const pathname = usePathname();
  const first = useRef(true);
  const [tick, setTick] = useState(0);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setTick((n) => n + 1);
    setActive(true);
    const t = setTimeout(() => setActive(false), 380);
    return () => clearTimeout(t);
  }, [pathname]);

  if (!active) return null;

  return (
    <div className="route-transition" key={tick} aria-hidden>
      <div className="route-sweep" />
      <div className="route-label mono">
        <span style={{ color: 'var(--arasaka-red)' }}>// ROUTING_PACKETS</span>
        <span className="blink" style={{ color: 'var(--arasaka-red)', marginLeft: 8 }}>▌</span>
      </div>
    </div>
  );
}

export default RouteTransition;
