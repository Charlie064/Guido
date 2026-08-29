import { useEffect, useRef } from "react";
import GlassMascot from "./GlassMascot";

const DANCE_MS = 1500;

/**
 * GuidoSplash — the "app just opened" moment: Guido dances center-stage
 * under the wordmark for a beat, then calls onComplete so the caller can
 * swap this out for the real app UI.
 *
 * Usage:
 *   const [showSplash, setShowSplash] = useState(true);
 *   return showSplash
 *     ? <GuidoSplash onComplete={() => setShowSplash(false)} />
 *     : <App />;
 *
 * Pure CSS animation (no JS physics needed for a fixed one-shot sequence) —
 * respects prefers-reduced-motion by skipping the dance and just fading the
 * wordmark in and out over a shorter duration. Renders through
 * <GlassMascot state="happy">, so it always matches the shipped mascot.
 */
export default function GuidoSplash({ onComplete, className, style }) {
  // Keep the latest callback in a ref rather than the effect's dependency
  // array — callers typically pass an inline arrow (see the usage example
  // above), which is a new reference on every parent render; depending on
  // it directly would restart the countdown on any unrelated re-render
  // during the splash window.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduceMotion ? 600 : DANCE_MS + 150;
    const timer = window.setTimeout(() => {
      if (onCompleteRef.current) onCompleteRef.current();
    }, duration);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        background: "var(--guido-splash-bg, #faf6f3)",
        ...style,
      }}
    >
      <div className="guido-splash-dance">
        <GlassMascot state="happy" size={140} />
      </div>
      <div className="guido-splash-word">Guido</div>

      <style>{`
        .guido-splash-dance {
          animation: guido-dance ${DANCE_MS}ms ease-in-out 1;
          transform-origin: 50% 90%;
        }
        .guido-splash-word {
          font-weight: 700;
          font-size: 22px;
          letter-spacing: 0.01em;
          color: #2a2233;
          opacity: 0;
          animation: guido-word-fade ${DANCE_MS + 150}ms ease-in-out 1;
        }
        @keyframes guido-dance {
          0%   { transform: translateY(0)     rotate(0deg)   scale(1, 1); }
          12%  { transform: translateY(-26px) rotate(10deg)  scale(1.1, 0.85); }
          25%  { transform: translateY(0)     rotate(-6deg)  scale(0.92, 1.12); }
          37%  { transform: translateY(-18px) rotate(8deg)   scale(1.08, 0.9); }
          50%  { transform: translateY(0)     rotate(-4deg)  scale(0.95, 1.08); }
          62%  { transform: translateY(-10px) rotate(4deg)   scale(1.04, 0.95); }
          75%  { transform: translateY(0)     rotate(-2deg)  scale(0.98, 1.03); }
          100% { transform: translateY(0)     rotate(0deg)   scale(1, 1); }
        }
        @keyframes guido-word-fade {
          0%   { opacity: 0; transform: translateY(6px); }
          12%  { opacity: 1; transform: translateY(0); }
          78%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .guido-splash-dance { animation: none; }
          .guido-splash-word { animation: guido-word-fade-reduced 600ms ease-in-out 1; }
          @keyframes guido-word-fade-reduced {
            0%  { opacity: 0; }
            20% { opacity: 1; }
            70% { opacity: 1; }
            100% { opacity: 0; }
          }
        }
      `}</style>
    </div>
  );
}
