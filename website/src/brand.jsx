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

export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
