import { useState, useEffect } from "react";
import "./Housekeeping.css";

const ME0 = { id: "HK-1042", name: "Anita Joseph", role: "Housekeeping Staff", dept: "Housekeeping", phone: "+91 98470 11042", email: "anita@grandpalm.com", area: "Floors 1 and 2", shift: "07:00 – 15:00", pw: "hk12345" };
const STAFF = { "HK-1042": "Anita Joseph", "HK-1043": "Priya Nair" };
const NAV = [
  ["dashboard", "Dashboard", "M3 11l9-8 9 8v10H3z"], ["rooms", "My Rooms", "M3 18V6M3 14h18v4M21 14v-3a3 3 0 00-3-3h-7v6"],
  ["allrooms", "Rooms", "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"], ["tasks", "Housekeeping Tasks", "M5 12l5 5 9-10"],
  ["requests", "Service Requests", "M4 5h16v11H8l-4 4z"], ["complaints", "Complaints", "M12 3l10 18H2zM12 10v5M12 18v.01"],
  ["supplies", "Supplies", "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"], ["attendance", "Attendance & Leave", "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2"],
  ["reports", "Reports", "M5 20V10M12 20V4M19 20v-7"], ["notifications", "Notifications", "M6 9a6 6 0 0112 0c0 6 3 7 3 7H3s3-1 3-7M10 20a2 2 0 004 0"],
];
const TITLES = { ...Object.fromEntries(NAV.map((n) => [n[0], n[1]])), issue: "Report Issue", profile: "Profile", settings: "Settings" };
const Icon = ({ d }) => <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;

const STATUS = { available: "Available", occupied: "Occupied", required: "Cleaning Required", assigned: "Assigned", progress: "In Progress", completed: "Clean", inspection: "Inspection", ready: "Ready", maintenance: "Maintenance", dnd: "Do Not Disturb", ooo: "Out of Order" };
const TONE = { required: "todo", assigned: "todo", dnd: "todo", progress: "progress", inspection: "progress", completed: "done", ready: "done", available: "done", maintenance: "rush", ooo: "rush", occupied: "occupied" };
const FLOW = ["required", "assigned", "progress", "completed", "inspection", "ready"];
const TT = { "Checkout Cleaning": 40, "Stayover Cleaning": 20, "Deep Cleaning": 60, "Quick Turnaround": 30, "Linen Change": 15, "Restocking": 15, "Inspection": 10, "Maintenance Follow-up": 20 };
const CHECKLIST = ["Inspect room", "Remove used linen", "Change bedsheets", "Clean bathroom", "Clean floor", "Clean surfaces", "Empty bins", "Replace towels", "Restock toiletries", "Check lights", "Check AC", "Check room equipment", "Final inspection"];
const ISSUES = ["AC problem", "Plumbing problem", "Electrical problem", "Furniture damage", "Missing item", "Cleaning issue", "Other"];
const NTYPES = ["Room", "Arrival", "Request", "Urgent", "Maintenance", "Complaint", "Supplies", "Overdue"];
const RSTEPS = ["New", "Accepted", "In Progress", "Completed"];
const all13 = CHECKLIST.map((_, i) => i);
const ME = "HK-1042";
const R = (id, rt, status, tt, o = {}) => ({ id, rt, status, tt, prio: "Normal", g: "", stay: "Vacant", inst: "", by: null, checked: [], issue: null, created: "07:30", due: "11:00", ...o });
const ROOMS0 = [
  R(101, "Deluxe", "inspection", "Checkout Cleaning", { by: ME, g: "Mr. Rao", stay: "Checked out 10:30", checked: all13, created: "07:15", due: "10:45" }),
  R(102, "Standard", "progress", "Stayover Cleaning", { by: ME, g: "Ms. Iyer", stay: "Staying", inst: "Extra pillow requested", checked: [0, 1, 2, 3] }),
  R(105, "Suite", "assigned", "Quick Turnaround", { by: ME, prio: "High", g: "Mr. Menon", stay: "Arrival 11:00", inst: "Early arrival. Prioritise.", due: "10:30" }),
  R(108, "Deluxe", "assigned", "Checkout Cleaning", { by: ME, g: "Ms. Das", stay: "Checked out 09:50", due: "12:00" }),
  R(110, "Standard", "maintenance", "Maintenance Follow-up", { by: ME, due: "13:00", issue: "AC problem" }),
  R(203, "Standard", "assigned", "Stayover Cleaning", { by: ME, g: "Mr. Khan", stay: "Staying", inst: "Do not disturb before 10:00", due: "12:30" }),
  R(206, "Suite", "assigned", "Deep Cleaning", { by: ME, prio: "High", g: "VIP Mr. Nair", stay: "Arrival 15:00", inst: "Fresh flowers", due: "14:00" }),
  R(104, "Standard", "available"), R(107, "Deluxe", "occupied", null, { g: "Ms. Pillai", stay: "Staying" }), R(109, "Standard", "dnd", null, { g: "Mr. Shah", stay: "Staying" }),
  R(201, "Deluxe", "occupied", null, { g: "Mr. Thomas", stay: "Staying" }), R(204, "Suite", "required", "Checkout Cleaning", { prio: "High", g: "Ms. Fernandez", stay: "Checked out 10:00" }),
  R(207, "Standard", "ooo"), R(301, "Suite", "ready"), R(302, "Deluxe", "required", "Checkout Cleaning", { g: "Mr. Bose", stay: "Checked out 10:15" }),
];
const REQ0 = [
  { id: "SR-101", room: 204, guest: "Ms. Fernandez", type: "Extra towel", prio: "Normal", by: null, status: "New", time: "09:10", done: "" },
  { id: "SR-102", room: 102, guest: "Ms. Iyer", type: "Extra pillow", prio: "High", by: ME, status: "Accepted", time: "09:40", done: "" },
  { id: "SR-103", room: 107, guest: "Ms. Pillai", type: "Water bottles", prio: "Normal", by: "HK-1043", status: "Completed", time: "08:30", done: "08:50" },
];
const COMP0 = [
  { id: "C-201", room: 204, guest: "Ms. Fernandez", cat: "Missing item", text: "Extra towel set missing after cleaning.", prio: "High", by: ME, status: "open", reply: "", created: "Yesterday 16:20", resolved: "" },
  { id: "C-202", room: 107, guest: "Ms. Pillai", cat: "Cleanliness", text: "Dust on bedside table and window sill.", prio: "Normal", by: ME, status: "open", reply: "", created: "Mon 29 Sep", resolved: "" },
  { id: "C-203", room: 102, guest: "Ms. Iyer", cat: "Cleanliness", text: "Bathroom mirror had streaks.", prio: "Normal", by: ME, status: "resolved", reply: "Re-cleaned and checked.", created: "Sat 27 Sep", resolved: "Sat 27 Sep 17:00" },
];
const SUP0 = [["Towels", 120, 80], ["Bedsheets", 90, 60], ["Pillow covers", 70, 50], ["Blankets", 20, 25], ["Soap", 55, 100], ["Shampoo", 80, 100], ["Toilet paper", 200, 150], ["Water bottles", 160, 120], ["Cleaning materials", 18, 20]].map(([n, qty, min]) => ({ n, qty, min }));
const NOTE0 = [
  ["Room", "Room 108 assigned to you", "08:50"], ["Arrival", "Guest arriving soon: Room 105 at 11:00", "08:45"], ["Request", "New service request: Room 204, extra towel", "09:10"],
  ["Supplies", "Low supplies: Blankets below minimum stock", "08:20"], ["Maintenance", "Room 110: AC problem reported", "08:05"], ["Overdue", "Room 101 task was due 10:45", "10:50"],
].map(([type, text, time], id) => ({ id, type, text, time, read: false }));

const hm = (m) => `${Math.floor(m / 60)}h ${m % 60}m`;
const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const Avatar = ({ name, big }) => <span className={`avatar ${big ? "big" : ""}`}>{name.split(" ").map((w) => w[0]).join("")}</span>;
const Stat = ({ label, value, sub, tone, onClick }) => <button className={`stat ${tone || ""}`} onClick={onClick}><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</button>;
const Tag = ({ s }) => <span className={`tag tag-${TONE[s]}`}>{STATUS[s]}</span>;
const Prio = ({ p }) => <span className={`tag ${p === "High" ? "tag-rush" : "tag-plain"}`}>{p}</span>;

function PasswordForm({ pw, onSave }) {
  const [f, setF] = useState({ cur: "", nw: "", cf: "" }), [msg, setMsg] = useState(null);
  const save = () => {
    if (f.cur !== pw) return setMsg(["err", "Current password is incorrect."]);
    if (f.nw.length < 8) return setMsg(["err", "Use at least 8 characters."]);
    if (f.nw !== f.cf) return setMsg(["err", "Passwords do not match."]);
    onSave(f.nw); setF({ cur: "", nw: "", cf: "" }); setMsg(["info", "Password updated."]);
  };
  return (
    <div className="form">
      {[["cur", "Current password"], ["nw", "New password"], ["cf", "Confirm new password"]].map(([k, l]) => <label key={k}>{l}<input type="password" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}
      {msg && <p className={msg[0]}>{msg[1]}</p>}
      <button className="btn" onClick={save}>Change password</button>
    </div>
  );
}
const Prefs = ({ prefs, setPrefs }) => (
  <ul className="lines">{NTYPES.map((k) => <li key={k}><span>{k} notifications</span><label className="switch"><input type="checkbox" checked={prefs[k] !== false} onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })} /><i /></label></li>)}</ul>
);

export default function HousekeepingDashboard() {
  const [me, setMe] = useState(ME0);
  const [view, setView] = useState("dashboard"), [ptab, setPtab] = useState("view"), [menu, setMenu] = useState(false), [modal, setModal] = useState(null), [out, setOut] = useState(false);
  const [toasts, setToasts] = useState([]), [rooms, setRooms] = useState(ROOMS0), [notes, setNotes] = useState(NOTE0);
  const [acts, setActs] = useState([["Room 102 cleaned", "08:15"], ["Room 105 assigned", "07:55"], ["Service request received", "09:10"], ["Room 110 marked for maintenance", "08:05"], ["Guest checkout received: Room 108", "07:40"]]);
  const [reqs, setReqs] = useState(REQ0), [comps, setComps] = useState(COMP0), [sup, setSup] = useState(SUP0), [cart, setCart] = useState({}), [sreqs, setSreqs] = useState([]);
  const [issues, setIssues] = useState([{ id: "I-1", room: 110, type: "AC problem", desc: "AC not cooling", prio: "High", at: "08:05", status: "Open" }]);
  const [rfilter, setRfilter] = useState("all"), [open, setOpen] = useState(null), [replies, setReplies] = useState({});
  const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [iform, setIform] = useState({ room: "", type: ISSUES[0], desc: "", prio: "Normal", at: nowLocal(), file: "" });
  const [rep, setRep] = useState({ date: "", floor: "all", staff: "all", room: "", status: "all" });
  const [punch, setPunch] = useState({ in: new Date().setHours(7, 2, 0, 0), out: null });
  const [leaves, setLeaves] = useState([{ id: 1, from: "10 Oct", to: "11 Oct", type: "Casual", status: "Approved" }]), [lf, setLf] = useState({ from: "", to: "", type: "Casual" });
  const [prefs, setPrefs] = useState({}), [sys, setSys] = useState({ compact: false, h24: false }), [edit, setEdit] = useState({}), [tick, setTick] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTick(new Date()), 30000); return () => clearInterval(t); }, []);

  if (out) {
    return (
      <div className="hk login-wrap"><div className="login"><span className="brand-mark">G</span><h1>You have been logged out</h1>
        <p className="muted">Your session has ended.</p><button className="btn" onClick={() => { setOut(false); setView("dashboard"); }}>Sign in again</button></div></div>
    );
  }

  const toast = (msg, kind = "ok") => { const id = Math.random(); setToasts((t) => [...t, { id, msg, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200); };
  const log = (t) => setActs((a) => [[t, clock()], ...a].slice(0, 8));
  const notify = (type, text) => setNotes((n) => [{ id: Math.random(), type, text, time: clock(), read: false }, ...n]);
  const upd = (id, p) => setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const step = (id, from, to, ms, after) => setTimeout(() => { setRooms((rs) => rs.map((r) => (r.id === id && r.status === from ? { ...r, status: to } : r))); after && after(); }, ms);
  const go = (v, tab) => { setView(v); if (tab) setPtab(tab); setMenu(false); };

  const mine = rooms.filter((r) => r.by === ME);
  const cnt = (...s) => mine.filter((r) => s.includes(r.status)).length;
  const pendingReq = reqs.filter((r) => r.status !== "Completed").length;
  const openComps = comps.filter((c) => c.status === "open").length;
  const visNotes = notes.filter((n) => prefs[n.type] !== false), unread = visNotes.filter((n) => !n.read).length;
  const mins = punch.in ? Math.max(0, Math.round(((punch.out || Date.now()) - punch.in) / 60000)) : 0;
  const duty = punch.in && !punch.out ? "On Duty" : punch.out ? "Off Duty" : "Not checked in";
  const hour = tick.getHours(), greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const when = tick.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: !sys.h24 });
  const nowHM = tick.toTimeString().slice(0, 5);
  const finished = (s) => ["completed", "inspection", "ready"].includes(s);
  const overdue = (r) => r.due < nowHM && !finished(r.status) && r.status !== "maintenance";

  const assignMe = (r) => { upd(r.id, { status: "assigned", by: ME }); log(`Room ${r.id} assigned`); toast(`Room ${r.id} assigned to you`); };
  const start = (r) => { upd(r.id, { status: "progress" }); log(`Room ${r.id} cleaning started`); toast(`Room ${r.id}: cleaning started`); };
  const chain = (id) => { // Supervisor inspection is simulated here; connect to your backend.
    step(id, "completed", "inspection", 1800, () => log(`Room ${id} sent for inspection`));
    step(id, "inspection", "ready", 8000, () => { log(`Room ${id} inspection completed`); notify("Room", `Room ${id} is ready`); });
  };
  const finish = (r) => { upd(r.id, { status: "completed", checked: all13 }); setOpen(null); log(`Room ${r.id} cleaned`); toast(`Room ${r.id}: cleaning completed`); chain(r.id); };
  const toggle = (r, k) => upd(r.id, { checked: r.checked.includes(k) ? r.checked.filter((x) => x !== k) : [...r.checked, k], status: r.status === "assigned" ? "progress" : r.status });
  const resolveIssue = (r) => { setIssues((is) => is.map((i) => (i.room === r.id ? { ...i, status: "Resolved" } : i))); upd(r.id, { status: "completed", issue: null, checked: all13 }); log(`Room ${r.id} issue resolved`); toast("Issue resolved. Room cleaned."); chain(r.id); };
  const issueFor = (id) => { setIform({ ...iform, room: String(id || "") }); go("issue"); };
  const sendIssue = () => {
    const id = Number(iform.room);
    if (!id || !iform.desc.trim()) return toast("Choose a room and add a description", "err");
    upd(id, { status: "maintenance", issue: iform.type });
    setIssues((is) => [{ id: `I-${is.length + 1}`, room: id, type: iform.type, desc: iform.desc, prio: iform.prio, at: iform.at.replace("T", " "), status: "Open" }, ...is]);
    log(`Room ${id} marked for maintenance`); notify("Maintenance", `Room ${id}: ${iform.type}`); toast("Issue reported");
    setIform({ room: "", type: ISSUES[0], desc: "", prio: "Normal", at: nowLocal(), file: "" });
  };
  const advance = (id) => setReqs((rs) => rs.map((r) => { if (r.id !== id) return r; const nx = { New: "Accepted", Accepted: "In Progress", "In Progress": "Completed" }[r.status]; if (nx === "Completed") log(`Service request ${id} completed`); return { ...r, status: nx, by: ME, done: nx === "Completed" ? clock() : "" }; }));
  const sendSupplies = () => {
    const items = Object.entries(cart).filter(([, n]) => n > 0).map(([n, c]) => `${n} × ${c}`).join(", ");
    setSreqs((s) => [{ id: Math.random(), items, time: clock(), status: "Requested" }, ...s]); setCart({}); toast("Supply request sent to administrator");
  };

  const Row = ({ r }) => (
    <div className={`rrow st-${TONE[r.status]}`}>
      <span className="room-no">{r.id}</span>
      <span className="rtype"><strong>{r.tt || "No task"}</strong><small>Floor {Math.floor(r.id / 100)} · {r.rt}{r.tt ? ` · about ${TT[r.tt]} min` : ""}</small></span>
      {r.prio === "High" && finished(r.status) === false && r.tt && <Prio p="High" />}
      {overdue(r) && <span className="tag tag-rush">Overdue</span>}
      <Tag s={r.status} />
    </div>
  );
  const filt = (arr, f) => arr.filter((r) => f === "all" || (f === "urgent" ? r.prio === "High" && !finished(r.status) : f === "todo" ? ["assigned", "required", "maintenance"].includes(r.status) : f === "progress" ? r.status === "progress" : finished(r.status)));
  const ftabs = [["all", "All"], ["todo", "To Do"], ["progress", "In Progress"], ["done", "Completed"], ["urgent", "Urgent"]];
  const Tabs = ({ v, set }) => <div className="tabs">{ftabs.map(([k, l]) => <button key={k} className={v === k ? "is-on" : ""} onClick={() => set(k)}>{l}</button>)}</div>;
  const lanes = [["To Do", "todo", (r) => ["assigned", "required", "maintenance"].includes(r.status)], ["In Progress", "progress", (r) => r.status === "progress"], ["Completed", "done", (r) => finished(r.status)]];

  const repRooms = rooms.filter((r) => r.tt && (rep.floor === "all" || Math.floor(r.id / 100) === Number(rep.floor)) && (rep.staff === "all" || r.by === rep.staff) && String(r.id).includes(rep.room) && (rep.status === "all" || r.status === rep.status));
  const doneToday = repRooms.filter((r) => finished(r.status)).length;
  const readiness = Math.round((rooms.filter((r) => ["ready", "available", "occupied"].includes(r.status)).length / rooms.length) * 100);
  const dist = Object.keys(STATUS).map((k) => [k, rooms.filter((r) => r.status === k).length]).filter(([, c]) => c > 0);
  const dismiss = (n) => setNotes(notes.map((x) => (x.id === n.id ? { ...x, read: true } : x)));

  return (
    <div className={`hk ${sys.compact ? "compact" : ""}`}>
      <aside className="side">
        <div className="brand"><span className="brand-mark">G</span><div><b>VEYRA</b><small>Housekeeping portal</small></div></div>
        <nav aria-label="Main">
          {NAV.map(([k, l, d]) => (
            <button key={k} className={`nav ${view === k ? "is-on" : ""}`} onClick={() => go(k, k === "profile" ? "view" : null)} aria-current={view === k ? "page" : undefined}>
              <Icon d={d} /><span>{l}</span>
              {k === "notifications" && unread > 0 && <em className="badge">{unread}</em>}
              {k === "complaints" && openComps > 0 && <em className="badge">{openComps}</em>}
              {k === "requests" && pendingReq > 0 && <em className="badge soft">{pendingReq}</em>}
              {k === "rooms" && cnt("assigned", "progress") > 0 && <em className="badge soft">{cnt("assigned", "progress")}</em>}
            </button>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="top">
          <div><p>{greet}, {me.name.split(" ")[0]} · {when}</p></div>
          <div className="top-right">
            <span className={`pill ${duty === "On Duty" ? "on" : ""}`}>{duty}</span>
            <button className="bell" onClick={() => go("notifications")} aria-label={`${unread} notifications`}><Icon d={NAV[9][2]} />{unread > 0 && <em className="badge">{unread}</em>}</button>
            <div className="menu-wrap">
              <button className="who" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}><Avatar name={me.name} /><span><b>{me.name}</b><small>{me.role}</small></span></button>
              {menu && (<><div className="scrim" onClick={() => setMenu(false)} />
                <div className="dropdown" role="menu">
                  <button onClick={() => go("profile", "view")}>View Profile</button><button onClick={() => go("profile", "edit")}>Edit Profile</button>
                  <button onClick={() => go("profile", "password")}>Change Password</button><button onClick={() => go("settings")}>Settings</button>
                  <button className="danger" onClick={() => { setMenu(false); setModal("logout"); }}>Logout</button>
                </div></>)}
            </div>
          </div>
        </header>

        <main className="page">
          <h2 className="page-title">{TITLES[view]}</h2>

          {view === "dashboard" && (<>
            <div className="stats">
              <Stat label="Rooms to clean" value={cnt("assigned", "required")} tone="warn" onClick={() => go("rooms")} />
              <Stat label="In progress" value={cnt("progress")} tone="blue" onClick={() => go("rooms")} />
              <Stat label="Clean & ready" value={cnt("completed", "inspection", "ready")} tone="good" />
              <Stat label="Maintenance" value={cnt("maintenance")} tone={cnt("maintenance") ? "bad" : ""} onClick={() => go("tasks")} />
              <Stat label="Guest arrivals today" value={mine.filter((r) => r.stay.startsWith("Arrival")).length} />
              <Stat label="Guest checkouts today" value={mine.filter((r) => r.stay.startsWith("Checked")).length} />
              <Stat label="Pending service requests" value={pendingReq} tone="warn" onClick={() => go("requests")} />
              <Stat label="Pending complaints" value={openComps} tone={openComps ? "bad" : ""} onClick={() => go("complaints")} />
            </div>
            <div className="cols">
              <section className="panel"><div className="panel-h"><h3>Up next</h3><button className="link" onClick={() => go("rooms")}>See my rooms</button></div>
                {mine.filter((r) => !finished(r.status)).sort((a, b) => (b.prio === "High") - (a.prio === "High")).slice(0, 4).map((r) => <Row key={r.id} r={r} />)}
                {mine.every((r) => finished(r.status)) && <p className="empty">All rooms are done. Nice work.</p>}</section>
              <section className="panel"><div className="panel-h"><h3>Recent activity</h3></div>
                <ul className="lines">{acts.map(([t, tm], i) => <li key={i}><span>{t}</span><small className="muted">{tm}</small></li>)}</ul></section>
            </div>
          </>)}

          {/* MY ROOMS: tile grid, tiles expand to full width */}
          {view === "rooms" && (<>
            <div className="rooms-bar"><span className="muted">Assigned to {me.name.split(" ")[0]} · {mine.length} rooms</span><Tabs v={rfilter} set={setRfilter} /></div>
            {filt(mine, rfilter).length === 0 && <p className="empty">No rooms in this filter.</p>}
            <div className="rgrid">
              {filt(mine, rfilter).map((r) => {
                const o = open === r.id, full = r.checked.length === 13, fi = FLOW.indexOf(r.status);
                return (
                  <div key={r.id} className={`rtile tone-${TONE[r.status]} ${o ? "open" : ""}`}>
                    <button className="rt-head" onClick={() => setOpen(o ? null : r.id)} aria-expanded={o}>
                      <span className="rt-no">{r.id}</span>
                      <span className="rt-info"><strong>{r.tt || "No task"}</strong>
                        <small>Floor {Math.floor(r.id / 100)} · {r.rt}{r.tt ? ` · ~${TT[r.tt]} min` : ""}</small>
                        <span className="rt-tags"><Tag s={r.status} />{r.prio === "High" && !finished(r.status) && <Prio p="High" />}{overdue(r) && <span className="tag tag-rush">Overdue</span>}</span>
                      </span>
                    </button>
                    <div className="rt-prog" title={`${r.checked.length} of 13`}><i style={{ width: `${(r.checked.length / 13) * 100}%` }} /></div>
                    {o && (
                      <div className="card-body">
                        <div>
                          <div className="flow">{r.status === "maintenance" ? ["Issue reported", "Maintenance", "Resolved", "Clean", "Inspection", "Ready"].map((s, i) => <span key={s} className={i < 2 ? "now" : ""}>{s}</span>)
                            : FLOW.map((s, i) => <span key={s} className={i < fi ? "past" : i === fi ? "now" : ""}>{STATUS[s]}</span>)}</div>
                          <p className="muted">{r.stay}{r.g ? ` · Guest: ${r.g}` : ""} · Priority {r.prio} · Due {r.due} · About {TT[r.tt]} min</p>
                          {r.inst && <p className="note-i">Special instructions: {r.inst}</p>}
                          <p className="muted">{r.checked.length} of 13 checklist items done</p>
                          <ul className="tasks">{CHECKLIST.map((t, k) => <li key={t}><label><input type="checkbox" checked={r.checked.includes(k)} disabled={finished(r.status) || r.status === "maintenance"} onChange={() => toggle(r, k)} /><span>{t}</span></label></li>)}</ul>
                        </div>
                        <div className="side-form">
                          {r.status === "assigned" && <button className="btn" onClick={() => start(r)}>Start cleaning</button>}
                          {r.status === "progress" && <button className="btn" disabled={!full} onClick={() => finish(r)}>{full ? "Complete cleaning" : `${13 - r.checked.length} items left`}</button>}
                          {r.status === "maintenance" && <button className="btn" onClick={() => resolveIssue(r)}>Mark issue resolved</button>}
                          {finished(r.status) && <p className="info">Cleaning completed. Waiting for supervisor inspection.</p>}
                          {!finished(r.status) && r.status !== "maintenance" && <button className="btn btn-ghost" onClick={() => issueFor(r.id)}>Report issue</button>}
                        </div>
                      </div>)}
                  </div>);
              })}
            </div>
          </>)}

          {view === "allrooms" && (
            <section className="panel">
              {[1, 2, 3].map((fl) => (
                <div key={fl}><h4>Floor {fl}</h4>
                  <div className="grid">{rooms.filter((r) => Math.floor(r.id / 100) === fl).map((r) => (
                    <div key={r.id} className={`rcard st-${TONE[r.status]}`}>
                      <div className="rc-top"><b>{r.id}</b><Tag s={r.status} /></div>
                      <small>{r.rt} · {r.by ? STAFF[r.by] : "Unassigned"}</small>
                      {r.prio === "High" && r.tt && <small className="urgent">High priority</small>}
                      {r.status === "required" && !r.by && fl <= 2 && <button className="btn btn-sm" onClick={() => assignMe(r)}>Assign to me</button>}
                    </div>))}</div></div>))}
            </section>
          )}

          {/* HOUSEKEEPING TASKS: kanban board */}
          {view === "tasks" && (
            <div className="board">
              {lanes.map(([title, tone, fn]) => {
                const list = mine.filter(fn);
                return (
                  <section key={title} className={`lane tone-${tone}`}>
                    <div className="lane-h"><span><i className="dot" />{title}</span><b>{list.length}</b></div>
                    {list.length === 0 && <p className="empty">Nothing here.</p>}
                    {list.map((r) => (
                      <article key={r.id} className="kcard">
                        <div className="k-top"><span className="k-room">Room {r.id}</span>{r.prio === "High" && <Prio p="High" />}{overdue(r) && <span className="tag tag-rush">Overdue</span>}</div>
                        <strong>{r.tt}</strong>
                        <div className="k-meta"><span>{STAFF[r.by]}</span><span>Due {r.due}</span><span>{TT[r.tt]} min</span></div>
                        {r.inst && <p className="k-note">{r.inst}</p>}
                        <div className="k-foot"><Tag s={r.status} />
                          {r.status === "assigned" ? <button className="btn btn-sm" onClick={() => { start(r); go("rooms"); setOpen(r.id); }}>Start</button> : <button className="btn btn-sm btn-ghost" onClick={() => { go("rooms"); setOpen(r.id); }}>Open</button>}</div>
                      </article>))}
                  </section>);
              })}
            </div>
          )}

          {/* SERVICE REQUESTS: ticket cards with progress stepper */}
          {view === "requests" && (
            <div className="rq-list">
              {reqs.map((r) => {
                const si = RSTEPS.indexOf(r.status);
                return (
                  <article key={r.id} className={`rq ${r.status === "Completed" ? "is-done" : ""}`}>
                    <span className="rq-room"><small>Room</small>{r.room}</span>
                    <div className="rq-main">
                      <div className="rq-title"><b>{r.type}</b><Prio p={r.prio} /><small className="muted">{r.id} · {r.guest}</small></div>
                      <ol className="rq-steps">{RSTEPS.map((s, i) => <li key={s} className={i < si ? "done" : i === si ? "now" : ""}><i />{s}</li>)}</ol>
                      <small className="muted">Requested {r.time} · {r.by ? `Assigned to ${STAFF[r.by]}` : "Unassigned"}{r.done && ` · Completed ${r.done}`}</small>
                    </div>
                    {r.status !== "Completed" && (r.by === ME || !r.by)
                      ? <button className="btn" onClick={() => advance(r.id)}>{{ New: "Accept", Accepted: "Start", "In Progress": "Complete" }[r.status]}</button>
                      : <span className="rq-end">{r.status === "Completed" ? "Done" : "Other staff"}</span>}
                  </article>);
              })}
            </div>
          )}

          {view === "issue" && (
            <div className="cols">
              <section className="panel"><div className="panel-h"><h3>Report an issue</h3></div>
                <div className="form">
                  <label>Room number<select value={iform.room} onChange={(e) => setIform({ ...iform, room: e.target.value })}><option value="">Select room</option>{rooms.map((r) => <option key={r.id}>{r.id}</option>)}</select></label>
                  <label>Issue type<select value={iform.type} onChange={(e) => setIform({ ...iform, type: e.target.value })}>{ISSUES.map((i) => <option key={i}>{i}</option>)}</select></label>
                  <label>Priority<select value={iform.prio} onChange={(e) => setIform({ ...iform, prio: e.target.value })}><option>Normal</option><option>High</option></select></label>
                  <label>Date and time<input type="datetime-local" value={iform.at} onChange={(e) => setIform({ ...iform, at: e.target.value })} /></label>
                  <label>Description<textarea rows="3" value={iform.desc} onChange={(e) => setIform({ ...iform, desc: e.target.value })} /></label>
                  <label>Photo (optional)<input type="file" accept="image/*" onChange={(e) => setIform({ ...iform, file: e.target.files[0]?.name || "" })} /></label>
                  <button className="btn" onClick={sendIssue}>Send report</button>
                </div></section>
              <section className="panel"><div className="panel-h"><h3>Reported issues</h3></div>
                <ul className="lines">{issues.map((i) => <li key={i.id}><span><b>Room {i.room}</b> · {i.type}<small className="block">{i.desc} · {i.at}</small></span><span className={`tag ${i.status === "Open" ? "tag-rush" : "tag-done"}`}>{i.status}</span></li>)}</ul></section>
            </div>
          )}

          {/* COMPLAINTS: case-file cards with quote */}
          {view === "complaints" && (
            <div className="cases">
              <p className="muted">{openComps} pending · {comps.length - openComps} resolved</p>
              {comps.map((c) => (
                <article key={c.id} className={`case ${c.status}`}>
                  <header className="case-h"><span className="case-id">{c.id}</span><b>{c.cat}</b><span className="case-room">Room {c.room}</span>
                    <span className={`tag ${c.status === "open" ? "tag-rush" : "tag-done"}`}>{c.status === "open" ? "Open" : "Resolved"}</span></header>
                  <blockquote>{c.text}<cite>{c.guest}</cite></blockquote>
                  <div className="case-meta"><span>Priority {c.prio}</span><span>Assigned {STAFF[c.by]}</span><span>Created {c.created}</span>{c.resolved && <span>Resolved {c.resolved}</span>}</div>
                  {c.status === "resolved" ? <p className="case-reply"><b>Resolution</b>{c.reply}</p> : (
                    <div className="c-form"><input placeholder="What did you do to fix it?" value={replies[c.id] || ""} onChange={(e) => setReplies({ ...replies, [c.id]: e.target.value })} />
                      <button className="btn btn-sm" onClick={() => { setComps(comps.map((x) => x.id === c.id ? { ...x, status: "resolved", reply: replies[c.id] || "Fixed.", resolved: clock() } : x)); log(`Complaint ${c.id} resolved`); toast("Complaint resolved"); }}>Resolve</button></div>)}
                </article>))}
            </div>
          )}

          {view === "supplies" && (
            <div className="cols">
              <section className="panel"><div className="scroll"><table><thead><tr><th>Item</th><th>Available</th><th>Minimum</th><th>Request</th></tr></thead>
                <tbody>{sup.map((s) => (
                  <tr key={s.n}><td>{s.n} {s.qty < s.min && <span className="tag tag-rush">Low stock</span>}</td><td><b>{s.qty}</b></td><td>{s.min}</td>
                    <td><span className="step"><button aria-label={`Less ${s.n}`} onClick={() => setCart({ ...cart, [s.n]: Math.max(0, (cart[s.n] || 0) - 1) })}>−</button><b>{cart[s.n] || 0}</b><button aria-label={`More ${s.n}`} onClick={() => setCart({ ...cart, [s.n]: (cart[s.n] || 0) + 1 })}>+</button></span></td></tr>))}</tbody></table></div>
                <button className="btn" disabled={!Object.values(cart).some((n) => n > 0)} onClick={sendSupplies}>Request supplies</button></section>
              <section className="panel"><div className="panel-h"><h3>Your requests</h3></div>
                {sreqs.length === 0 && <p className="empty">No requests yet.</p>}
                <ul className="lines">{sreqs.map((s) => <li key={s.id}><span>{s.items}<small className="block">{s.time}</small></span><span className="tag tag-progress">{s.status}</span></li>)}</ul></section>
            </div>
          )}

          {view === "attendance" && (
            <div className="cols">
              <section className="panel"><div className="panel-h"><h3>Today · {duty}</h3></div>
                <div className="clockbox"><div><small>Check in</small><b>{punch.in ? new Date(punch.in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}</b></div>
                  <div><small>Check out</small><b>{punch.out ? new Date(punch.out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}</b></div><div><small>Working hours</small><b>{hm(mins)}</b></div></div>
                {!punch.in || punch.out ? <button className="btn" onClick={() => { setPunch({ in: Date.now(), out: null }); toast("Checked in"); }}>Check in</button> : <button className="btn btn-dark" onClick={() => { setPunch({ ...punch, out: Date.now() }); toast("Checked out"); }}>Check out</button>}
                <h4>Attendance history</h4>
                <ul className="lines">{[["Yesterday", "07:00 – 15:05", "Present"], ["Mon, 29 Sep", "07:12 – 15:00", "Late"], ["Sun, 28 Sep", "07:00 – 15:00", "Present"]].map(([d, t, s]) => <li key={d}><span>{d} · {t}</span><span className={`tag ${s === "Late" ? "tag-progress" : "tag-done"}`}>{s}</span></li>)}</ul></section>
              <section className="panel"><div className="panel-h"><h3>Request leave</h3></div>
                <div className="form">
                  <label>From<input type="date" value={lf.from} onChange={(e) => setLf({ ...lf, from: e.target.value })} /></label>
                  <label>To<input type="date" value={lf.to} onChange={(e) => setLf({ ...lf, to: e.target.value })} /></label>
                  <label>Type<select value={lf.type} onChange={(e) => setLf({ ...lf, type: e.target.value })}><option>Casual</option><option>Sick</option><option>Earned</option></select></label>
                  <button className="btn" disabled={!lf.from || !lf.to} onClick={() => { setLeaves([{ id: Math.random(), ...lf, status: "Pending" }, ...leaves]); setLf({ from: "", to: "", type: "Casual" }); toast("Leave request sent"); }}>Send request</button></div>
                <h4>Leave history</h4>
                <ul className="lines">{leaves.map((l) => <li key={l.id}><span>{l.from} – {l.to} · {l.type}</span><span className={`tag ${l.status === "Approved" ? "tag-done" : "tag-progress"}`}>{l.status}</span></li>)}</ul></section>
            </div>
          )}

          {/* REPORTS: dark KPI hero, chips, charts */}
          {view === "reports" && (<>
            <div className="rp-bar">
              <label>Date<input type="date" value={rep.date} onChange={(e) => setRep({ ...rep, date: e.target.value })} /></label>
              <label>Floor<select value={rep.floor} onChange={(e) => setRep({ ...rep, floor: e.target.value })}><option value="all">All</option><option>1</option><option>2</option><option>3</option></select></label>
              <label>Staff<select value={rep.staff} onChange={(e) => setRep({ ...rep, staff: e.target.value })}><option value="all">All</option>{Object.entries(STAFF).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
              <label>Room<input value={rep.room} placeholder="e.g. 10" onChange={(e) => setRep({ ...rep, room: e.target.value })} /></label>
              <label>Status<select value={rep.status} onChange={(e) => setRep({ ...rep, status: e.target.value })}><option value="all">All</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            </div>
            <div className="rp-hero">
              <div><small>Cleaned today</small><b>{doneToday}</b></div>
              <div><small>Cleaned this week</small><b>{38 + doneToday}</b></div>
              <div><small>Avg cleaning time</small><b>32 min</b><em>Team avg 34 min</em></div>
              <div><small>Room readiness</small><b>{readiness}%</b><span className="rp-ring"><i style={{ width: `${readiness}%` }} /></span></div>
            </div>
            <div className="rp-chips">
              <div className="warn"><b>{repRooms.filter((r) => !finished(r.status)).length}</b><span>Pending tasks</span></div>
              <div className="good"><b>{doneToday}</b><span>Completed tasks</span></div>
              <div className="bad"><b>{issues.filter((i) => i.status === "Open").length}</b><span>Maintenance issues</span></div>
              <div className="blue"><b>{pendingReq} / {openComps}</b><span>Requests / complaints</span></div>
            </div>
            <div className="cols">
              <section className="panel"><div className="panel-h"><h3>Room status mix</h3></div>
                <ul className="bars">{dist.map(([k, c]) => <li key={k} className={`tone-${TONE[k]}`}><span>{STATUS[k]}</span><span className="bar"><i style={{ width: `${(c / rooms.length) * 100}%` }} /></span><b>{c}</b></li>)}</ul></section>
              <section className="panel"><div className="panel-h"><h3>Staff workload</h3></div>
                <ul className="lines">{Object.entries(STAFF).map(([k, n]) => { const c = rooms.filter((r) => r.by === k && r.tt).length; return <li key={k}><span>{n}</span><span className="loadbar"><i style={{ width: `${c * 12}%` }} /></span><b>{c} rooms</b></li>; })}</ul></section>
            </div>
          </>)}

          {view === "notifications" && (
            <section className="panel"><div className="panel-h"><span className="muted">{unread} unread</span><button className="link" onClick={() => setNotes(notes.map((n) => ({ ...n, read: true })))}>Mark all read</button></div>
              {visNotes.length === 0 && <p className="empty">No notifications.</p>}
              <ul className="lines">{visNotes.map((n) => <li key={n.id} className={n.read ? "" : "unread"} onClick={() => dismiss(n)}><span><span className="tag tag-plain">{n.type}</span> {n.text}</span><small className="muted">{n.time}</small></li>)}</ul></section>
          )}

          {view === "profile" && (<>
            <section className="panel prof"><Avatar name={me.name} big />
              <div className="prof-grid"><h2>{me.name}</h2>
                {[["Employee ID", me.id], ["Role", me.role], ["Department", me.dept], ["Phone", me.phone], ["Email", me.email], ["Assigned", me.area], ["Duty status", duty], ["Working hours", hm(mins)]].map(([k, v]) => <p key={k}><small>{k}</small>{v}</p>)}</div></section>
            <div className="tabs wrap">{[["view", "View Profile"], ["edit", "Edit Profile"], ["password", "Change Password"]].map(([k, l]) => <button key={k} className={ptab === k ? "is-on" : ""} onClick={() => { setPtab(k); setEdit({}); }}>{l}</button>)}<button onClick={() => go("attendance")}>Attendance</button></div>
            {ptab === "edit" && <section className="panel form"><label>Name<input value={edit.name ?? me.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label><label>Phone<input value={edit.phone ?? me.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label><label>Email<input value={edit.email ?? me.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
              <button className="btn" onClick={() => { setMe({ ...me, ...edit }); setEdit({}); toast("Profile updated"); }}>Save changes</button></section>}
            {ptab === "password" && <section className="panel"><PasswordForm pw={me.pw} onSave={(pw) => { setMe({ ...me, pw }); toast("Password changed"); }} /></section>}
          </>)}

          {view === "settings" && (
            <div className="cols">
              <div className="stack">
                <section className="panel"><div className="panel-h"><h3>Account</h3><button className="link" onClick={() => go("profile", "edit")}>Edit</button></div><p className="muted">{me.name} · {me.email} · {me.id}</p></section>
                <section className="panel"><div className="panel-h"><h3>Notification settings</h3></div><Prefs prefs={prefs} setPrefs={setPrefs} /></section>
                <section className="panel"><div className="panel-h"><h3>System preferences</h3></div>
                  <ul className="lines"><li><span>Compact layout</span><label className="switch"><input type="checkbox" checked={sys.compact} onChange={(e) => setSys({ ...sys, compact: e.target.checked })} /><i /></label></li>
                    <li><span>24-hour time</span><label className="switch"><input type="checkbox" checked={sys.h24} onChange={(e) => setSys({ ...sys, h24: e.target.checked })} /><i /></label></li></ul></section>
              </div>
              <div className="stack">
                <section className="panel"><div className="panel-h"><h3>Password & security</h3></div><PasswordForm pw={me.pw} onSave={(pw) => { setMe({ ...me, pw }); toast("Password changed"); }} /></section>
                <section className="panel"><button className="btn btn-dark" onClick={() => setModal("logout")}>Logout</button></section>
              </div>
            </div>
          )}
        </main>
      </div>

      {modal === "logout" && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="dialog"><h3>Are you sure you want to logout?</h3>
            <div className="two"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-danger" onClick={() => { setModal(null); setOut(true); }}>Logout</button></div></div>
        </div>)}
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}</div>
    </div>
  );
}