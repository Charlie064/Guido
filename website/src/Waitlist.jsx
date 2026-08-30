import { useEffect, useState } from "react";
import { ArrowLeft, Check, X } from "lucide-react";
import GlassMascot from "@mascot/GlassMascot.jsx";

const APPS = [
  { id: "excel", label: "Excel", img: "/assets/excel.png" },
  { id: "word", label: "Word" },
  { id: "notion", label: "Notion", img: "/assets/notion.png" },
  { id: "adobe", label: "Adobe" },
  { id: "davinci", label: "DaVinci Resolve", img: "/assets/davinci-resolve.svg" },
  { id: "cad", label: "CAD / CAM" },
  { id: "blender", label: "Blender", img: "/assets/blender.png" },
];

const ROLES = [
  { id: "university_student", label: "University student" },
  { id: "young_professional", label: "Young professional" },
  { id: "high_school_student", label: "High school student" },
  { id: "entrepreneur", label: "Entrepreneur / Founder" },
  { id: "creative", label: "Creative / Freelancer" },
  { id: "other", label: "Other" },
];

const TILE = "linear-gradient(160deg, #d3d4f8 0%, #e4c8ee 50%, #f6c7dd 100%)";
const ENTER_MS = 1180;
const LEAVE_MS = 320;

function Progress({ step }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6" aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className="h-1.5 rounded-full transition-all duration-300"
          style={{
            width: n === step ? 28 : 10,
            background: n <= step ? "#2a2233" : "rgba(42,34,51,0.18)",
          }}
        />
      ))}
    </div>
  );
}

function WaitlistForm({ onClose, referredBy }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [apps, setApps] = useState([]);
  const [appsOther, setAppsOther] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  function toggleApp(id) {
    setApps((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function nextFromIdentity(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setError("");
    setStep(2);
  }

  function nextFromApps() {
    if (apps.length === 0 && !appsOther.trim()) {
      setError("Pick an app, or tell us something else.");
      return;
    }
    setError("");
    setStep(3);
  }

  async function submitRole() {
    if (status === "loading") return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          apps,
          appsOther: appsOther.trim(),
          role,
          ref: referredBy || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setError(data.error || "Something went wrong. Try again.");
        return;
      }
      setResult(data);
      setStatus("done");
      setStep(4);
    } catch {
      setStatus("error");
      setError("Something went wrong. Try again.");
    }
  }

  async function copyLink() {
    if (!result?.referralUrl) return;
    try {
      await navigator.clipboard.writeText(result.referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="how-step waitlist-card relative w-full text-left"
      style={{ background: TILE }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="waitlist-title"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-[#2a2233]/55 hover:bg-white/40"
      >
        <X size={16} />
      </button>

      {step < 4 ? <Progress step={step} /> : null}

      {step === 1 && (
        <form key="identity" onSubmit={nextFromIdentity} className="waitlist-pane relative flex flex-col gap-4">
          <div>
            <p className="waitlist-kicker">Guido</p>
            <h3 id="waitlist-title" className="waitlist-title">
              Get in line.
            </h3>
            <p className="waitlist-copy">
              Name and email. That's all we need to start.
            </p>
          </div>
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="waitlist-input"
          />
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="waitlist-input"
          />
          <button type="submit" className="waitlist-next">
            Continue
          </button>
        </form>
      )}

      {step === 2 && (
        <div key="apps" className="waitlist-pane relative flex flex-col gap-4">
          <div>
            <h3 id="waitlist-title" className="waitlist-title waitlist-title-sm">
              What do you want to use Guido for?
            </h3>
            <p className="waitlist-copy">
              Pick any that apply. Optional: tell us something we missed.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {APPS.map((app) => {
              const on = apps.includes(app.id);
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => toggleApp(app.id)}
                  className={`waitlist-choice ${on ? "is-on" : ""}`}
                >
                  {app.img ? (
                    <img src={app.img} alt="" className="w-7 h-7 object-contain" />
                  ) : null}
                  <span>{app.label}</span>
                  {on ? <Check size={14} className="ml-auto shrink-0" /> : null}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={appsOther}
            onChange={(e) => setAppsOther(e.target.value)}
            placeholder="Something else?"
            className="waitlist-input"
            maxLength={280}
          />
          {error ? <p className="text-sm text-[#b4234a]">{error}</p> : null}
          <div className="flex items-center gap-3">
            <button type="button" className="waitlist-back" onClick={() => setStep(1)}>
              <ArrowLeft size={15} />
              Back
            </button>
            <button type="button" className="waitlist-next" onClick={nextFromApps}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div key="role" className="waitlist-pane relative flex flex-col gap-4">
          <div>
            <h3 id="waitlist-title" className="waitlist-title waitlist-title-sm">
              How would you best describe yourself?
            </h3>
            <p className="waitlist-copy">
              Optional. Helps us know who we're building for.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {ROLES.map((item) => {
              const on = role === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRole(on ? "" : item.id)}
                  className={`waitlist-choice ${on ? "is-on" : ""}`}
                >
                  <span>{item.label}</span>
                  {on ? <Check size={14} className="ml-auto shrink-0" /> : null}
                </button>
              );
            })}
          </div>
          {error ? <p className="text-sm text-[#b4234a]">{error}</p> : null}
          <div className="flex items-center gap-3">
            <button type="button" className="waitlist-back" onClick={() => { setStatus("idle"); setStep(2); }}>
              <ArrowLeft size={15} />
              Back
            </button>
            <button
              type="button"
              className="waitlist-next"
              disabled={status === "loading"}
              onClick={submitRole}
            >
              {status === "loading" ? "Joining..." : "Join the waitlist"}
            </button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div key="done" className="waitlist-pane relative flex flex-col gap-5 text-center">
          <div>
            <h3 id="waitlist-title" className="waitlist-title">
              You're on the list.
            </h3>
            <p className="waitlist-copy">
              {result.alreadyJoined
                ? "This email was already signed up. Here's your link again."
                : "We'll email you when Guido is ready."}
            </p>
          </div>
          {result.position ? (
            <p className="waitlist-place">#{result.position}</p>
          ) : null}
          <p className="waitlist-copy">
            Send this to a friend. We'll know they came from you.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input readOnly value={result.referralUrl || ""} className="waitlist-input text-center sm:text-left" />
            <button type="button" className="waitlist-next sm:w-auto" onClick={copyLink}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WaitlistOverlay({ open, onClose, referredBy = "" }) {
  const [stage, setStage] = useState(open ? "enter" : "idle");
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    setStage(open ? "enter" : "leave");
  }

  useEffect(() => {
    if (stage === "enter") {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const t = setTimeout(() => setStage("form"), reduce ? 40 : ENTER_MS);
      return () => clearTimeout(t);
    }
    if (stage === "leave") {
      const t = setTimeout(() => setStage("idle"), LEAVE_MS);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const shown = stage !== "idle";

  useEffect(() => {
    if (!shown) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [shown]);

  if (!shown) return null;

  return (
    <div
      className={`waitlist-overlay ${stage}`}
      onClick={onClose}
    >
      {stage === "enter" ? (
        <div className="waitlist-mark" onClick={(e) => e.stopPropagation()} aria-hidden="true">
          <img src="/assets/get-guido.png" alt="" />
          <div className="waitlist-mark-buddy">
            <GlassMascot state="happy" size={78} />
          </div>
        </div>
      ) : (
        <div className="waitlist-shell" onClick={(e) => e.stopPropagation()}>
          <WaitlistForm onClose={onClose} referredBy={referredBy} />
        </div>
      )}
    </div>
  );
}
