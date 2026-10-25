import { useState } from "react";
import "./login.css";

const ROLES = [
  { name: "Front Desk", icon: "ti-bell-ringing" },
  { name: "Housekeeping", icon: "ti-bed" },
  { name: "Billing", icon: "ti-receipt" },
  { name: "Admin", icon: "ti-settings" },
];

function findRole(roleName) {
  if (!roleName) return ROLES[0];
  const r = String(roleName).trim().toLowerCase();
  return (
    ROLES.find((item) => item.name.toLowerCase() === r) ||
    ROLES.find((item) => (r.startsWith("admin") && item.name === "Admin")) ||
    ROLES.find((item) => (r.startsWith("front") && item.name === "Front Desk")) ||
    ROLES[0]
  );
}

function HotelArt() {
  const win = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++)
      win.push(<rect key={`t${r}${c}`} x={160 + c * 28} y={46 + r * 28} width="14" height="16" rx="2" />);
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 2; c++) {
      win.push(<rect key={`l${r}${c}`} x={92 + c * 26} y={96 + r * 28} width="12" height="16" rx="2" />);
      win.push(<rect key={`r${r}${c}`} x={262 + c * 26} y={96 + r * 28} width="12" height="16" rx="2" />);
    }
  return (
    <svg className="lp-art" viewBox="0 0 400 170" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <g fill="#1D2C50" stroke="#D4AF37" strokeWidth="1.5" strokeLinejoin="round">
        <rect x="150" y="32" width="100" height="138" />
        <rect x="80" y="82" width="70" height="88" />
        <rect x="250" y="82" width="70" height="88" />
        <rect x="190" y="14" width="20" height="18" />
        <rect x="20" y="120" width="60" height="50" />
        <rect x="320" y="120" width="60" height="50" />
      </g>
      <g fill="#D4AF37" opacity="0.8">{win}</g>
      <line x1="0" y1="169" x2="400" y2="169" stroke="#D4AF37" strokeWidth="1.5" />
    </svg>
  );
}

// onLogin, onRegister, initialRole, initialUsername and loginError are provided by loginaction.jsx
export default function LoginPage({ onLogin, onRegister, initialRole, initialUsername, loginError }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [prevInitialRole, setPrevInitialRole] = useState(initialRole);
  const [role, setRole] = useState(() => findRole(initialRole).name);
  const [prevInitialUser, setPrevInitialUser] = useState(initialUsername);
  const [username, setUsername] = useState(initialUsername || "");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [localError, setLocalError] = useState("");
  const [loading, setLoading] = useState(false);

  if (initialRole !== prevInitialRole) {
    setPrevInitialRole(initialRole);
    setRole(findRole(initialRole).name);
  }

  if (initialUsername !== prevInitialUser) {
    setPrevInitialUser(initialUsername);
    if (initialUsername) setUsername(initialUsername);
  }

  const roleIcon = findRole(role).icon;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError("");

    if (mode === "login") {
      if (!username.trim() || !password.trim()) {
        setLocalError("Enter both your username and password.");
        return;
      }
      // loginaction.jsx validates credentials and redirects on success
      if (onLogin) {
        onLogin({ role, username: username.trim(), password, remember });
      }
    } else {
      if (!fullName.trim()) {
        setLocalError("Please enter your full name.");
        return;
      }
      if (!username.trim()) {
        setLocalError("Please enter a username.");
        return;
      }
      if (!email.trim()) {
        setLocalError("Please enter an email address.");
        return;
      }
      if (!password.trim() || password.trim().length < 4) {
        setLocalError("Password must be at least 4 characters.");
        return;
      }

      setLoading(true);
      if (onRegister) {
        const res = await onRegister({
          role,
          full_name: fullName.trim(),
          username: username.trim(),
          email: email.trim(),
          password: password.trim(),
        });
        if (res && !res.success) {
          setLocalError(res.error || "Registration failed.");
        }
      }
      setLoading(false);
    }
  };

  const displayedError = localError || (mode === "login" ? loginError : "");

  return (
    <div className="lp">
      {/* Decorative Gold Filigree Corner Accents */}
      <svg className="lp-filigree lp-filigree-tl" viewBox="0 0 320 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M 0,280 C 150,280 280,150 280,0" stroke="#C9A227" strokeWidth="1.5" strokeOpacity="0.32" />
        <path d="M 0,230 C 130,230 230,130 230,0" stroke="#C9A227" strokeWidth="1" strokeOpacity="0.22" />
        <path d="M 0,160 C 90,160 160,90 160,0" stroke="#E4C766" strokeWidth="1.5" strokeOpacity="0.4" />
        <circle cx="160" cy="0" r="3.5" fill="#D4AF37" fillOpacity="0.65" />
        <circle cx="0" cy="160" r="3.5" fill="#D4AF37" fillOpacity="0.65" />
        <path d="M 0,90 C 50,90 90,50 90,0" stroke="#C9A227" strokeWidth="1" strokeOpacity="0.25" />
      </svg>
      <svg className="lp-filigree lp-filigree-br" viewBox="0 0 320 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M 320,40 C 170,40 40,170 40,320" stroke="#C9A227" strokeWidth="1.5" strokeOpacity="0.32" />
        <path d="M 320,90 C 190,90 90,190 90,320" stroke="#C9A227" strokeWidth="1" strokeOpacity="0.22" />
        <path d="M 320,160 C 230,160 160,230 160,320" stroke="#E4C766" strokeWidth="1.5" strokeOpacity="0.4" />
        <circle cx="160" cy="320" r="3.5" fill="#D4AF37" fillOpacity="0.65" />
        <circle cx="320" cy="160" r="3.5" fill="#D4AF37" fillOpacity="0.65" />
        <path d="M 320,230 C 270,230 230,270 230,320" stroke="#C9A227" strokeWidth="1" strokeOpacity="0.25" />
      </svg>

      <div className="lp-card">
        <div className="lp-brand-top">
          <div className="lp-logo-glow">
            <img src="/logo.png" alt="VEYRA Logo" className="lp-logo-img" />
          </div>
          <h1 className="lp-name">VEYRA</h1>
          <div className="lp-divider-flourish">
            <span className="lp-flourish-line" />
            <span className="lp-flourish-star">✦</span>
            <span className="lp-flourish-line" />
          </div>
        </div>

        <form className="lp-form" onSubmit={handleSubmit} noValidate>
          {/* Mode Switcher Tabs */}
          <div className="lp-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={`lp-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => {
                setMode("login");
                setLocalError("");
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={`lp-tab ${mode === "register" ? "active" : ""}`}
              onClick={() => {
                setMode("register");
                setLocalError("");
              }}
            >
              Register
            </button>
          </div>

          <div className="lp-field">
            <label htmlFor="role">Role</label>
            <div className="lp-input">
              <i className={`ti ${roleIcon} lp-lead`} aria-hidden="true"></i>
              <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
              <i className="ti ti-chevron-down lp-chevron" aria-hidden="true"></i>
            </div>
          </div>

          {mode === "register" && (
            <div className="lp-field">
              <label htmlFor="fullName">Full Name</label>
              <div className="lp-input">
                <i className="ti ti-id lp-lead" aria-hidden="true"></i>
                <input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="e.g. John Mathews"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setLocalError("");
                  }}
                />
              </div>
            </div>
          )}

          <div className="lp-field">
            <label htmlFor="username">{mode === "register" ? "Username" : "Username or email"}</label>
            <div className="lp-input">
              <i className="ti ti-user lp-lead" aria-hidden="true"></i>
              <input
                id="username"
                type="text"
                autoComplete="username"
                placeholder={mode === "register" ? "e.g. j.mathews" : "j.mathews"}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setLocalError("");
                }}
              />
            </div>
          </div>

          {mode === "register" && (
            <div className="lp-field">
              <label htmlFor="email">Email</label>
              <div className="lp-input">
                <i className="ti ti-mail lp-lead" aria-hidden="true"></i>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="e.g. j.mathews@hotel.in"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setLocalError("");
                  }}
                />
              </div>
            </div>
          )}

          <div className="lp-field">
            <div className="lp-label-row">
              <label htmlFor="password">Password</label>
              {mode === "login" && (
                <a href="#forgot" className="lp-forgot">Forgot password?</a>
              )}
            </div>
            <div className="lp-input">
              <i className="ti ti-lock lp-lead" aria-hidden="true"></i>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                placeholder={mode === "register" ? "Create a password (min 4 chars)" : "Enter your password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setLocalError("");
                }}
              />
              <button
                type="button"
                className="lp-eye"
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <i className={`ti ${showPassword ? "ti-eye-off" : "ti-eye"}`} aria-hidden="true"></i>
              </button>
            </div>
          </div>

          {mode === "login" && (
            <label className="lp-remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Keep me signed in on this device
            </label>
          )}

          {displayedError && (
            <div className="lp-error" role="alert">
              {displayedError}
            </div>
          )}

          <button type="submit" className="lp-submit" disabled={loading}>
            {loading ? "Processing..." : mode === "register" ? "Register & Sign in →" : "Sign in →"}
          </button>

          <p className="lp-switch-text">
            {mode === "login" ? (
              <>
                New staff member?{" "}
                <button
                  type="button"
                  className="lp-link-btn"
                  onClick={() => {
                    setMode("register");
                    setLocalError("");
                  }}
                >
                  Register here
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="lp-link-btn"
                  onClick={() => {
                    setMode("login");
                    setLocalError("");
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </p>

          <p className="lp-secure">
            <i className="ti ti-shield-lock" aria-hidden="true"></i>
            Access is logged and restricted to authorized hotel staff
          </p>
        </form>
      </div>
    </div>
  );
}
