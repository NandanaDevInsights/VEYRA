import React, { useState } from "react";
import Login from "./login.jsx";
import Admindashboard from "./Admindashboard.jsx";
import Billingdashboard from "./Billingdashboard.jsx";
import Frontdashboard from "./frontdashboard.jsx";
import Housekeepingdashboard from "./Housekeepingdashboard.jsx";

// Keys match the names in the Role dropdown on the login page
const DASHBOARDS = {
  "Front desk": Frontdashboard,
  "Housekeeping": Housekeepingdashboard,
  "Billing": Billingdashboard,
  "Administrator": Admindashboard,
};

export default function LoginAction() {
  const [role, setRole] = useState(null);

  if (role) {
    const Dashboard = DASHBOARDS[role];
    return <Dashboard role={role} onLogout={() => setRole(null)} />;
  }

  return <Login onLogin={(data) => setRole(data.role)} />;
}