import { useEffect, useRef, useState } from "react";
import GlassMascot from "./GlassMascot";

const DANCE_MS = 1500;

/**
 * GlassMascotCursor — Guido, floating and trailing the pointer.
 *
 * Mount once near the app root:
 *   <GlassMascotCursor />
 *
 * - Trails the mouse with a light lag, leans into fast movement, and settles
 *   into a gentle idle sway when the pointer stops moving.
 * - Click anywhere on the page and Guido dances in place for a beat.
 * - Pass `danceSignal` — any value that changes — to trigger a dance from
 *   your own code too, e.g. after a tutorial step completes:
 *     <GlassMascotCursor danceSignal={completedStepCount} />
 * - Desktop-only by design (it's mouse-driven). Turn it off on touch
 *   devices with `disabled`: <GlassMascotCursor disabled={isTouchDevice} />
 * - Renders through <GlassMascot> for the actual body/face — this
 *   component only owns position and motion, so the two never drift apart
 *   visually. cursor-follow-demo.html is the reference feel this was built
 *   from (same easing/dance constants).
 */
export default function GlassMascotCursor({
  size = 108,
  disabled = false,
  danceSignal,
  className,
  style,
}) {
  const rootRef = useRef(null);
  const [face, setFace] = useState("idle");
  const stateRef = useRef(null);
  if (!stateRef.current) {
    stateRef.current = {
      mouseX: 0,
      mouseY: 0,
      posX: 0,
      posY: 0,
      hasMouse: true,
      lastMove: 0,
      danceStart: -Infinity,
      danceX: 0,
      danceY: 0,
      face: "idle",
    };
  }

  useEffect(() => {
    if (disabled || typeof window === "undefined") return undefined;

    const el = rootRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const s = stateRef.current;

    s.mouseX = window.innerWidth / 2;
    s.mouseY = window.innerHeight / 2;
    s.posX = s.mouseX;
    s.posY = s.mouseY;
    s.lastMove = performance.now();

    function startDance(x, y) {
      s.danceStart = performance.now();
      s.danceX = x;
      s.danceY = y;
    }

    function onMove(e) {
      s.mouseX = e.clientX;
      s.mouseY = e.clientY;
      s.hasMouse = true;
      s.lastMove = performance.now();
    }
    function onLeave() {
      s.hasMouse = false;
    }
    function onEnter() {
      s.hasMouse = true;
    }
    function onClick() {
      startDance(s.posX, s.posY);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("mouseenter", onEnter);
    window.addEventListener("click", onClick);

    let raf;
    let prevTime = performance.now();

    function frame(now) {
      const dt = Math.min((now - prevTime) / 16.67, 3);
      prevTime = now;

      const dancing = now - s.danceStart < DANCE_MS;
      let scaleX = 1,
        scaleY = 1,
        rotate = 0,
        bobY = 0,
        nextFace = "idle";

      if (dancing) {
        const t = (now - s.danceStart) / DANCE_MS;
        const decay = 1 - t;
        bobY = -Math.abs(Math.sin(t * Math.PI * 4)) * 30 * decay;
        rotate = Math.sin(t * Math.PI * 9) * 14 * decay;
        const squish = Math.sin(t * Math.PI * 4);
        scaleY = 1 - squish * 0.22 * decay;
        scaleX = 1 + squish * 0.16 * decay;
        nextFace = "happy";
        s.posX = s.danceX;
        s.posY = s.danceY;
      } else {
        const targetX = s.mouseX;
        const targetY = s.mouseY - 6;
        const ease = reduceMotion ? 1 : 0.16 * dt;
        const dx = targetX - s.posX;
        const dy = targetY - s.posY;
        const prevX = s.posX,
          prevY = s.posY;
        s.posX += dx * ease;
        s.posY += dy * ease;
        const vx = s.posX - prevX;
        const vy = s.posY - prevY;
        const speed = Math.sqrt(vx * vx + vy * vy);
        const idleFor = now - s.lastMove;

        if (speed > 6) {
          const stretch = Math.min(speed / 40, 0.28);
          scaleX = 1 + stretch;
          scaleY = 1 - stretch * 0.6;
          rotate = Math.max(-14, Math.min(14, (vx / 40) * 10));
        } else if (idleFor > 900) {
          bobY = Math.sin(now / 500) * 4;
          rotate = Math.sin(now / 900) * 5;
        }
      }

      if (el) {
        el.style.transform =
          "translate3d(" + s.posX + "px," + (s.posY + bobY) + "px,0) " +
          "rotate(" + rotate + "deg) scale(" + scaleX + "," + scaleY + ")";
        el.style.opacity = s.hasMouse || dancing ? "1" : "0.5";
      }

      // The face only actually flips at dance start/end, so only touch
      // React state on that transition — not every animation frame.
      if (nextFace !== s.face) {
        s.face = nextFace;
        setFace(nextFace);
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("mouseenter", onEnter);
      window.removeEventListener("click", onClick);
    };
  }, [disabled]);

  // Lets parent code trigger a dance too (e.g. on a "step complete" moment)
  // without needing a ref — just change this prop's value.
  const prevSignal = useRef(danceSignal);
  useEffect(() => {
    if (danceSignal === undefined) return;
    // Track the latest signal even while disabled, so re-enabling later
    // doesn't replay a dance for a change that happened while off.
    if (prevSignal.current === danceSignal) return;
    prevSignal.current = danceSignal;
    if (disabled) return;
    const s = stateRef.current;
    s.danceStart = performance.now();
    s.danceX = s.posX;
    s.danceY = s.posY;
  }, [danceSignal, disabled]);

  if (disabled) return null;

  return (
    <div
      ref={rootRef}
      className={className}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 9999,
        width: size,
        marginLeft: -size / 2,
        marginTop: (-size * 1.15) / 2,
        pointerEvents: "none",
        willChange: "transform",
        filter: "drop-shadow(0 14px 18px rgba(60,40,70,0.16))",
        ...style,
      }}
    >
      <GlassMascot state={face} size={size} />
    </div>
  );
}
