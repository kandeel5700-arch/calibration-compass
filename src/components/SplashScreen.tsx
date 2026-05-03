import { useEffect, useState } from "react";
import logoUrl from "@/assets/uecc-logo.png";

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 1900);
    const t2 = setTimeout(onDone, 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <div
      className={`splash-root ${leaving ? "splash-leaving" : ""}`}
      aria-hidden="true"
    >
      {/* Animated background */}
      <div className="splash-bg" />
      <div className="splash-orb splash-orb-1" />
      <div className="splash-orb splash-orb-2" />
      <div className="splash-grid" />

      {/* Logo */}
      <div className="splash-content">
        <div className="splash-ring splash-ring-1" />
        <div className="splash-ring splash-ring-2" />
        <div className="splash-ring splash-ring-3" />
        <div className="splash-logo-wrap">
          <div className="splash-glow" />
          <div className="splash-logo">
            <img src={logoUrl} alt="UECC" />
          </div>
        </div>
        <div className="splash-text">
          <h1 className="splash-title">UECC Survey</h1>
          <p className="splash-subtitle">نظام إدارة المعايرة</p>
        </div>
        <div className="splash-loader">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
