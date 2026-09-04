import { useEffect, useRef } from "react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Edge-only pink/lilac wash. Center stays clear so the hero mark isn't tinted.
 */
export default function BackgroundGradient({
  gradientBackgroundStart = "rgb(255, 255, 255)",
  gradientBackgroundEnd = "rgb(255, 255, 255)",
  firstColor = "255, 46, 154",
  secondColor = "196, 181, 253",
  thirdColor = "238, 120, 185",
  fourthColor = "167, 139, 250",
  fifthColor = "255, 160, 200",
  pointerColor = "255, 46, 154",
  size = "70%",
  blendingValue = "normal",
  interactive = true,
  className = "",
  containerClassName = "",
}) {
  const rootRef = useRef(null);
  const pointerRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty("--gradient-background-start", gradientBackgroundStart);
    root.style.setProperty("--gradient-background-end", gradientBackgroundEnd);
    root.style.setProperty("--first-color", firstColor);
    root.style.setProperty("--second-color", secondColor);
    root.style.setProperty("--third-color", thirdColor);
    root.style.setProperty("--fourth-color", fourthColor);
    root.style.setProperty("--fifth-color", fifthColor);
    root.style.setProperty("--pointer-color", pointerColor);
    root.style.setProperty("--size", size);
    root.style.setProperty("--blending-value", blendingValue);
  }, [
    blendingValue,
    fifthColor,
    firstColor,
    fourthColor,
    gradientBackgroundEnd,
    gradientBackgroundStart,
    pointerColor,
    secondColor,
    size,
    thirdColor,
  ]);

  useEffect(() => {
    if (!interactive) return;
    const root = rootRef.current;
    const pointer = pointerRef.current;
    if (!root || !pointer) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    const box = () => root.getBoundingClientRect();
    let x = box().width / 2;
    let y = box().height / 2;
    let tx = x;
    let ty = y;
    let frame = 0;

    const onMove = (event) => {
      const rect = box();
      tx = event.clientX - rect.left;
      ty = event.clientY - rect.top;
    };

    const tick = () => {
      x += (tx - x) / 18;
      y += (ty - y) / 18;
      pointer.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, [interactive]);

  const blob = (extra) =>
    cx(
      "absolute top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)] h-[var(--size)] w-[var(--size)]",
      extra,
    );

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={cx("guido-gradient pointer-events-none fixed inset-0 z-0 overflow-hidden", containerClassName)}
    >
      <div className={cx("guido-gradient-blobs h-full w-full", className)}>
        <div
          className={blob(
            "guido-blob-a opacity-55 blur-3xl [background:radial-gradient(circle_at_center,rgba(var(--first-color),0.5)_0,rgba(var(--first-color),0)_58%)_no-repeat] [mix-blend-mode:var(--blending-value)] [transform-origin:center_center]",
          )}
        />
        <div
          className={blob(
            "guido-blob-b opacity-50 blur-3xl [background:radial-gradient(circle_at_center,rgba(var(--second-color),0.62)_0,rgba(var(--second-color),0)_55%)_no-repeat] [mix-blend-mode:var(--blending-value)] [transform-origin:calc(50%-420px)]",
          )}
        />
        <div
          className={blob(
            "guido-blob-c opacity-50 blur-3xl [background:radial-gradient(circle_at_center,rgba(var(--third-color),0.52)_0,rgba(var(--third-color),0)_55%)_no-repeat] [mix-blend-mode:var(--blending-value)] [transform-origin:calc(50%+420px)]",
          )}
        />
        <div
          className={blob(
            "guido-blob-d opacity-45 blur-3xl [background:radial-gradient(circle_at_center,rgba(var(--fourth-color),0.55)_0,rgba(var(--fourth-color),0)_55%)_no-repeat] [mix-blend-mode:var(--blending-value)] [transform-origin:calc(50%-220px)_calc(50%+280px)]",
          )}
        />
        <div
          className={blob(
            "guido-blob-e opacity-45 blur-3xl [background:radial-gradient(circle_at_center,rgba(var(--fifth-color),0.58)_0,rgba(var(--fifth-color),0)_55%)_no-repeat] [mix-blend-mode:var(--blending-value)] [transform-origin:calc(50%+280px)_calc(50%-260px)]",
          )}
        />
        {interactive ? (
          <div
            ref={pointerRef}
            className="absolute top-0 left-0 h-[40vw] w-[40vw] max-h-[24rem] max-w-[24rem] -translate-x-1/2 -translate-y-1/2 opacity-35 blur-2xl [background:radial-gradient(circle_at_center,rgba(var(--pointer-color),0.4)_0,rgba(var(--pointer-color),0)_55%)_no-repeat] [mix-blend-mode:var(--blending-value)]"
          />
        ) : null}
      </div>
      {/* Keep the hero center clean — wash only around the edges */}
      <div className="guido-gradient-center-clear" />
    </div>
  );
}
