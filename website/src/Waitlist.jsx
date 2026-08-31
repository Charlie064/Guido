import { useState } from "react";
import { Check, X } from "lucide-react";
import GlassMascot from "@mascot/GlassMascot.jsx";

const PERSONAS = [
  { value: "uni_student", label: "University student" },
  { value: "young_professional", label: "Young professional" },
  { value: "high_school_student", label: "High school student" },
  { value: "entrepreneur", label: "Entrepreneur / Founder" },
  { value: "other", label: "Other" },
];

function WaitlistCard({ onClose }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [persona, setPersona] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | submitting | done | error

  function nextFromIdentity(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setStep(2);
  }

  async function submit() {
    if (status === "submitting") return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          persona,
        }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      className="relative w-full max-w-md rounded-3xl border border-black/10 bg-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)] p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="waitlist-title"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:bg-black/5"
      >
        <X size={16} />
      </button>

      {status === "done" ? (
        <div className="flex flex-col items-center gap-4 text-center py-4">
          <GlassMascot state="happy" size={72} />
          <h3 id="waitlist-title" className="text-xl font-bold text-[#0A0A0A]">
            You're on the list.
          </h3>
          <p className="text-sm text-neutral-500">We'll email you when Guido is ready.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center gap-2 mb-6" aria-hidden="true">
            {[1, 2].map((n) => (
              <span
                key={n}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: n === step ? 28 : 10, background: n <= step ? "#0A0A0A" : "rgba(10,10,10,0.15)" }}
              />
            ))}
          </div>

          {step === 1 && (
            <form onSubmit={nextFromIdentity} className="flex flex-col gap-4">
              <div>
                <h3 id="waitlist-title" className="text-xl font-bold text-[#0A0A0A]">
                  Get in line.
                </h3>
                <p className="text-sm text-neutral-500 mt-1">Name and email. That's all we need to start.</p>
              </div>
              <input
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="rounded-full border border-black/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-black/30"
              />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="rounded-full border border-black/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-black/30"
              />
              <button
                type="submit"
                className="rounded-full px-4 py-2.5 text-sm font-semibold text-white bg-[#0A0A0A] hover:bg-[#1a1a1a] transition-colors"
              >
                Continue
              </button>
            </form>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 id="waitlist-title" className="text-lg font-bold text-[#0A0A0A]">
                  How would you best describe yourself?
                </h3>
                <p className="text-sm text-neutral-500 mt-1">Optional. Helps us know who we're building for.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {PERSONAS.map((p) => {
                  const active = persona === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPersona(active ? null : p.value)}
                      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors"
                      style={{
                        background: active ? "#0A0A0A" : "#ffffff",
                        borderColor: active ? "#0A0A0A" : "rgba(0,0,0,0.15)",
                        color: active ? "#ffffff" : "#6b6b6b",
                      }}
                    >
                      {p.label}
                      {active && <Check size={12} />}
                    </button>
                  );
                })}
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="rounded-full border border-black/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-black/30"
              />
              {status === "error" && <p className="text-xs text-red-500">Something went wrong. Try again.</p>}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm font-semibold text-neutral-500 hover:text-neutral-800 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={status === "submitting"}
                  onClick={submit}
                  className="flex-1 rounded-full px-4 py-2.5 text-sm font-semibold text-white bg-[#0A0A0A] hover:bg-[#1a1a1a] transition-colors disabled:opacity-60"
                >
                  {status === "submitting" ? "Joining…" : "Join the waitlist"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function WaitlistOverlay({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(10,10,10,0.55)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <WaitlistCard onClose={onClose} />
      </div>
    </div>
  );
}
