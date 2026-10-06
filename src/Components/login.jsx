import React, { useState } from "react";
import "./login.css";

const ROLES = [
  { name: "Front desk", icon: "ti-bell-ringing" },
  { name: "Housekeeping", icon: "ti-bed" },
  { name: "Billing", icon: "ti-receipt" },
  { name: "Administrator", icon: "ti-settings" },
];

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

// onLogin is provided by LoginAction.jsx
export default function LoginPage({ onLogin }) {
  const [role, setRole] = useState("Front desk");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState(false);

  const roleIcon = ROLES.find((r) => r.name === role).icon;

  const handleSignIn = (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError(true);
      return;
    }
    setError(false);

    // TODO: replace with real authentication call, then call onLogin on success
    if (onLogin) {
      onLogin({ role, username: username.trim(), remember });
    }
  };

  return (
    <div className="lp">
      <div className="lp-card">
        <header className="lp-header">
          <HotelArt />
          <div className="lp-header-content">
            <div className="lp-mark">
              <i className="ti ti-building-skyscraper" aria-hidden="true"></i>
            </div>
            <h1 className="lp-name">VEYRA</h1>
            <p className="lp-tag">Staff management portal</p>
          </div>
        </header>

        <form className="lp-form" onSubmit={handleSignIn} noValidate>
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

          <div className="lp-field">
            <label htmlFor="username">Username or email</label>
            <div className="lp-input">
              <i className="ti ti-user lp-lead" aria-hidden="true"></i>
              <input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="j.mathews"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="lp-field">
            <div className="lp-label-row">
              <label htmlFor="password">Password</label>
              <a href="#forgot" className="lp-forgot">Forgot password?</a>
            </div>
            <div className="lp-input">
              <i className="ti ti-lock lp-lead" aria-hidden="true"></i>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

          <label className="lp-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Keep me signed in on this device
          </label>

          {error && (
            <div className="lp-error" role="alert">
              Enter both your username and password.
            </div>
          )}

          <button type="submit" className="lp-submit">Sign in</button>

          <p className="lp-secure">
            <i className="ti ti-shield-lock" aria-hidden="true"></i>
            Access is logged and restricted to authorized hotel staff
          </p>
        </form>
      </div>
    </div>
  );
}