export const BRAND = "#B6FF3E";
export const FLASH_PINK = "#FF2E9A";
export const FLASH_BLUE = "#3B82F6";

const PLUS_GRID =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M20 15v10M15 20h10' stroke='%23000000' stroke-opacity='0.09' stroke-width='1.2'/%3E%3C/svg%3E\")";

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/assets/guido-icon.png"
        alt="Guido"
        className="w-11 h-11 rounded-xl"
        style={{
          border: "1.5px solid rgba(0,0,0,0.1)",
          boxShadow: "0 0 0 4px rgba(196,181,253,0.15), 0 4px 10px -2px rgba(0,0,0,0.15)",
        }}
      />
      <span className="font-semibold text-[17px] tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        Guido
      </span>
    </div>
  );
}

export function PlusGrid({ className = "", children }) {
  return (
    <div
      className={className}
      style={{ backgroundImage: PLUS_GRID, backgroundRepeat: "repeat" }}
    >
      {children}
    </div>
  );
}

export function GuidoButton({ className = "", children, type = "button", href, onClick }) {
  const inner = (
    <>
      <span
        className="absolute inset-x-1 top-1 h-1/3 rounded-full pointer-events-none"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.25), rgba(255,255,255,0))" }}
      />
      <span className="relative flex items-center justify-center gap-2">{children}</span>
    </>
  );
  const style = {
    background: "linear-gradient(180deg, #2a2a2a 0%, #0A0A0A 60%, #000000 100%)",
    boxShadow: "0 5px 0 0 #000, 0 14px 26px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)",
  };
  const cls = `relative inline-flex items-center justify-center gap-2 rounded-full font-semibold text-white overflow-hidden ${className}`;

  if (href) {
    return (
      <a href={href} className={cls} style={style}>
        {inner}
      </a>
    );
  }

  return (
    <button type={type} onClick={onClick} className={cls} style={style}>
      {inner}
    </button>
  );
}
