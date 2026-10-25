import { useState } from "react";
import HomeLogin from "./homelogin.jsx";
import Login from "./login.jsx";
import Admindashboard from "./Admindashboard.jsx";
import Billingdashboard from "./Billingdashboard.jsx";
import Frontdashboard from "./frontdashboard.jsx";
import Housekeepingdashboard from "./Housekeepingdashboard.jsx";
import SplashAnimation from "./SplashAnimation.jsx";
import { authApi } from "../api.js";

// Role names supported by the system
const ROLES = ["Admin", "Billing", "Front Desk", "Housekeeping"];

// Normalizes any role variation to canonical role name
function normalizeRole(role) {
  if (!role) return "Front Desk";
  const r = String(role).trim().toLowerCase();
  if (r === "admin" || r === "administrator") return "Admin";
  if (r === "front desk" || r === "frontdesk" || r === "front") return "Front Desk";
  if (r === "billing") return "Billing";
  if (r === "housekeeping") return "Housekeeping";
  return role;
}

// Maps each role to the dashboard component it redirects to after login
const DASHBOARDS = {
  "Admin": Admindashboard,
  "Administrator": Admindashboard,
  "Billing": Billingdashboard,
  "Front Desk": Frontdashboard,
  "Front desk": Frontdashboard,
  "frontdesk": Frontdashboard,
  "Housekeeping": Housekeepingdashboard,
};

// Hook containing all login flow state & handlers
export function useLoginAction() {
  const getSavedUser = () => {
    try {
      const token = localStorage.getItem("veyra_token");
      const userStr = localStorage.getItem("veyra_user");
      if (token && userStr) {
        return JSON.parse(userStr);
      }
    } catch {
      // ignore
    }
    return null;
  };

  const savedUser = getSavedUser();
  const [page, setPage] = useState(() => (savedUser ? "dashboard" : "home")); // "home" | "login" | "dashboard"
  const [role, setRole] = useState(() => (savedUser ? (savedUser.role || "Front Desk") : "Front Desk"));
  const [username, setUsername] = useState(() => (savedUser ? (savedUser.full_name || savedUser.username || "") : ""));
  const [currentUser, setCurrentUser] = useState(() => savedUser);
  const [error, setError] = useState("");

  // Role selection handling & navigation from home to login
  const goToLogin = (selectedRole) => {
    const targetRole = selectedRole ? normalizeRole(selectedRole) : "Front Desk";
    setRole(targetRole);
    setError("");
    setPage("login");
  };

  // Authenticate against real MySQL database with bcrypt hash and role verification
  const login = async ({ role: chosenRole, username: enteredUser, password, remember }) => {
    const currentRole = chosenRole ? normalizeRole(chosenRole) : role;

    if (!enteredUser || !password) {
      setError("Enter both your username and password.");
      return false;
    }

    try {
      const res = await authApi.login({
        role: currentRole,
        username: enteredUser,
        password,
        keepSigned: remember,
      });

      if (res.success && res.token) {
        localStorage.setItem("veyra_token", res.token);
        localStorage.setItem("veyra_user", JSON.stringify(res.user));
        setCurrentUser(res.user);
        setRole(res.user.role || currentRole);
        setUsername(res.user.full_name || res.user.username);
        setError("");
        setPage("dashboard");
        return true;
      } else {
        setError(res.error || "Login failed.");
        return false;
      }
    } catch (err) {
      setError(err.message || "Invalid username or password.");
      return false;
    }
  };

  // Register new staff account into users and roles tables in database
  const register = async ({ role: chosenRole, full_name, username: enteredUser, email, password }) => {
    const currentRole = chosenRole ? normalizeRole(chosenRole) : role;
    try {
      const res = await authApi.register({
        role: currentRole,
        full_name,
        username: enteredUser,
        email,
        password,
      });

      if (res.success && res.token) {
        localStorage.setItem("veyra_token", res.token);
        localStorage.setItem("veyra_user", JSON.stringify(res.user));
        setCurrentUser(res.user);
        setRole(res.user.role || currentRole);
        setUsername(res.user.full_name || res.user.username);
        setError("");
        setPage("dashboard");
        return { success: true };
      }
      return { success: false, error: res.error || "Registration failed." };
    } catch (err) {
      return { success: false, error: err.message || "Registration failed." };
    }
  };

  // Taking user back to the login page when logging out from any dashboard
  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    localStorage.removeItem("veyra_token");
    localStorage.removeItem("veyra_user");
    setCurrentUser(null);
    setError("");
    setPage("login");
  };

  return {
    page,
    role,
    username,
    currentUser,
    error,
    goToLogin,
    login,
    register,
    logout,
    setPage,
  };
}

// Chooses which screen to render based on the current login flow state.
// Splash animation is shown before home page appears when app starts.
export default function LoginAction() {
  const { page, role, username, currentUser, error, goToLogin, login, register, logout } = useLoginAction();
  const [showSplash, setShowSplash] = useState(() => !localStorage.getItem("veyra_token"));

  return (
    <>
      {showSplash && <SplashAnimation onComplete={() => setShowSplash(false)} />}
      {page === "login" ? (
        <Login
          initialRole={role}
          initialUsername={username}
          loginError={error}
          onLogin={login}
          onRegister={register}
        />
      ) : page === "dashboard" && role ? (
        (() => {
          const Dashboard = DASHBOARDS[role] || DASHBOARDS[normalizeRole(role)] || Frontdashboard;
          return <Dashboard username={username} currentUser={currentUser} onLogout={logout} />;
        })()
      ) : (
        <HomeLogin onLogin={goToLogin} />
      )}
    </>
  );
}
