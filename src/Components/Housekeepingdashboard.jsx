import { useState, useEffect, useCallback } from "react";
import "./Housekeeping.css";
import { housekeepingApi } from "../api.js";

const ME0 = { id: "HK-1042", name: "Anita Joseph", role: "Housekeeping Staff", dept: "Housekeeping", phone: "+91 98470 11042", email: "anita@grandpalm.com", area: "Floors 1 and 2", shift: "07:00 – 15:00", pw: "hk12345" };
const STAFF = { "HK-1042": "Anita Joseph", "HK-1043": "Priya Nair" };
const NAV = [
  ["dashboard", "Overview", "M3 11l9-8 9 8v10H3z"],
  ["rooms", "My Rooms", "M3 18V6M3 14h18v4M21 14v-3a3 3 0 00-3-3h-7v6"],
  ["requests", "Service Requests", "M4 5h16v11H8l-4 4z"],
  ["history", "My History", "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"],
  ["supplies", "Supplies", "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"],
  ["notifications", "Notifications", "M6 9a6 6 0 0112 0c0 6 3 7 3 7H3s3-1 3-7M10 20a2 2 0 004 0"],
  ["attendance", "Attendance & Shift", "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2"],
  ["issue", "Report Issue", "M12 3l10 18H2zM12 10v5M12 18v.01"],
];
const TITLES = {
  ...Object.fromEntries(NAV.map((n) => [n[0], n[1]])),
  dashboard: "Housekeeping Overview & Activities",
  rooms: "My Rooms & Cleaning Tasks",
  requests: "Service Requests",
  history: "My History & Performance Ratings",
  supplies: "Supplies & Inventory",
  notifications: "Alerts & Notifications",
  attendance: "Shift Attendance",
  issue: "Report Maintenance Issue",
  profile: "Profile",
  settings: "Settings",
};
const Icon = ({ d }) => <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;

const STATUS = { available: "Available", occupied: "Occupied", required: "Cleaning Required", assigned: "Assigned", progress: "In Progress", completed: "Clean & Ready", inspection: "Inspection", ready: "Ready", maintenance: "Maintenance", dnd: "Do Not Disturb", ooo: "Out of Order" };
const TONE = { required: "todo", assigned: "todo", dnd: "todo", progress: "progress", inspection: "progress", completed: "done", ready: "done", available: "done", maintenance: "rush", ooo: "rush", occupied: "occupied" };
const FLOW = ["required", "assigned", "progress", "completed", "inspection", "ready"];
const TT = { "Checkout Cleaning": 40, "Stayover Cleaning": 20, "Deep Cleaning": 60, "Quick Turnaround": 30, "Linen Change": 15, "Restocking": 15, "Inspection": 10, "Maintenance Follow-up": 20 };
const CHECKLIST = ["Inspect room", "Remove used linen", "Change bedsheets", "Clean bathroom", "Clean floor", "Clean surfaces", "Empty bins", "Replace towels", "Restock toiletries", "Check lights", "Check AC", "Check room equipment", "Final inspection"];
const ISSUES = ["AC problem", "Plumbing problem", "Electrical problem", "Furniture damage", "Missing item", "Cleaning issue", "Other"];
const NTYPES = ["Room", "Arrival", "Request", "Rating", "Urgent", "Maintenance", "Complaint", "Supplies", "Overdue"];
const RSTEPS = ["New", "In Progress", "Completed"];
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
  ["Rating", "Front Desk rated Anita Joseph 5 stars for Room 101: 'Spotless room and prompt service!'", "10:55"],
  ["Room", "Room 108 assigned to you", "08:50"],
  ["Arrival", "Guest arriving soon: Room 105 at 11:00", "08:45"],
  ["Request", "New service request: Room 204, extra towel", "09:10"],
  ["Supplies", "Supplies Restocked: Linens & Towels restocked in Floor 1 closet", "08:30"],
  ["Maintenance", "Room 110: AC problem reported", "08:05"],
].map(([type, text, time], id) => ({ id, type, text, time, read: false }));

const hm = (m) => `${Math.floor(m / 60)}h ${m % 60}m`;
const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const Avatar = ({ name, big }) => <span className={`avatar ${big ? "big" : ""}`}>{name.split(" ").map((w) => w[0]).join("")}</span>;
const Stat = ({ label, value, sub, tone, onClick }) => <button className={`stat ${tone || ""}`} onClick={onClick}><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</button>;
const Tag = ({ s }) => <span className={`tag tag-${TONE[s] || "plain"}`}>{STATUS[s] || s}</span>;
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

export default function HousekeepingDashboard({ onLogout, username }) {
  const initialMe = () => {
    if (!username) return ME0;
    const name = username.includes("@")
      ? username.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : username;
    return { ...ME0, name, email: username.includes("@") ? username : ME0.email };
  };
  const [me, setMe] = useState(initialMe);
  const [view, setView] = useState("dashboard"), [ptab, setPtab] = useState("view"), [menu, setMenu] = useState(false), [modal, setModal] = useState(null), [out, setOut] = useState(false);
  const [toasts, setToasts] = useState([]), [rooms, setRooms] = useState(ROOMS0), [notes, setNotes] = useState(NOTE0);
  const [acts, setActs] = useState([["Room 102 cleaned", "08:15"], ["Room 105 assigned", "07:55"], ["Service request received", "09:10"], ["Room 110 marked for maintenance", "08:05"], ["Guest checkout received: Room 108", "07:40"]]);
  const [reqs, setReqs] = useState(REQ0), [comps, setComps] = useState(COMP0), [sup, setSup] = useState(SUP0), [cart, setCart] = useState({}), [sreqs, setSreqs] = useState([]);
  const [issues, setIssues] = useState([{ id: "I-1", room: 110, type: "AC problem", desc: "AC not cooling", prio: "High", at: "08:05", status: "Open" }]);
  const [rfilter, setRfilter] = useState("all"), [open, setOpen] = useState(null), [replies, setReplies] = useState({});
  const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [iform, setIform] = useState({ room: "", type: ISSUES[0], desc: "", prio: "Normal", at: nowLocal(), file: "" });
  const [punch, setPunch] = useState({ in: new Date().setHours(7, 2, 0, 0), out: null });
  const [leaves, setLeaves] = useState([{ id: 1, from: "10 Oct", to: "11 Oct", type: "Casual", status: "Approved" }]), [lf, setLf] = useState({ from: "", to: "", type: "Casual" });
  const [prefs, setPrefs] = useState({}), [sys, setSys] = useState({ compact: false, h24: false }), [edit, setEdit] = useState({}), [tick, setTick] = useState(new Date());

  // Performance ratings history from Front Desk
  const [ratings, setRatings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("veyra_hk_ratings_history") || "null");
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch (e) {}
    return [
      { id: "R-101", room: 101, type: "Checkout Cleaning", staff: "Anita Joseph", rating: 5, comment: "Room 101 was immaculate. Spotless mirrors and crisp linen. Thank you Anita!", tags: ["Clean & Tidy", "Prompt Response"], time: "10:50" },
      { id: "R-102", room: 102, type: "Extra pillow request", staff: "Anita Joseph", rating: 5, comment: "Very prompt response. Delivered extra pillows within 5 minutes of call.", tags: ["Prompt Response", "Courteous & Polite"], time: "09:45" },
      { id: "R-108", room: 108, type: "Checkout Cleaning", staff: "Anita Joseph", rating: 5, comment: "Turned over checkout room in record time, guest checked in early smoothly.", tags: ["Fast Completion", "Attention to Detail"], time: "Yesterday 15:30" },
    ];
  });

  const toast = (msg, kind = "ok") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  };
  const log = (t) => setActs((a) => [[t, clock()], ...a].slice(0, 8));
  const notify = (type, text) => setNotes((n) => [{ id: Math.random(), type, text, time: clock(), read: false }, ...n]);
  const upd = (id, p) => setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const step = (id, from, to, ms, after) => setTimeout(() => { setRooms((rs) => rs.map((r) => (r.id === id && r.status === from ? { ...r, status: to } : r))); after && after(); }, ms);
  const go = (v, tab) => { setView(v); if (tab) setPtab(tab); setMenu(false); };

  const refreshData = useCallback(async () => {
    try {
      const [rRes, srRes, cRes, supRes, attRes, lRes, nRes] = await Promise.allSettled([
        housekeepingApi.getRooms(),
        housekeepingApi.getServiceRequests(),
        housekeepingApi.getComplaints(),
        housekeepingApi.getSupplies(),
        housekeepingApi.getAttendance(),
        housekeepingApi.getLeave(),
        housekeepingApi.getNotifications(),
      ]);

      if (rRes.status === "fulfilled" && rRes.value?.success && rRes.value.rooms?.length) {
        const mappedRooms = rRes.value.rooms.map((rm) => {
          let st = "available";
          if (rm.status === "occupied") st = "occupied";
          else if (rm.status === "vacant_dirty") st = "required";
          else if (rm.status === "being_cleaned") st = "progress";
          else if (rm.status === "out_of_service") st = "maintenance";
          else if (rm.status === "reserved") st = "assigned";
          return R(Number(rm.no), rm.type, st, "Checkout Cleaning", { by: ME });
        });
        setRooms(mappedRooms);
      }

      if (supRes.status === "fulfilled" && supRes.value?.success && supRes.value.supplies?.length) {
        setSup(supRes.value.supplies.map((s) => ({ n: s.name, qty: s.qty, min: s.min_qty })));
      }

      if (srRes.status === "fulfilled" && srRes.value?.success && srRes.value.requests?.length) {
        setReqs(srRes.value.requests.map((sr) => {
          let st = "New";
          if (sr.status === "completed") st = "Completed";
          else if (sr.status === "in_progress" || sr.status === "assigned" || sr.status === "accepted") st = "In Progress";
          return {
            id: `SR-${sr.id}`,
            db_id: sr.id,
            room: Number(sr.room_number) || 101,
            guest: "In-House Guest",
            type: sr.category || "Service",
            desc: sr.description || "",
            prio: "Normal",
            by: ME,
            status: st,
            time: sr.created_at ? String(sr.created_at).slice(11, 16) : clock(),
            done: sr.status === "completed" ? "Done" : "",
          };
        }));
      }

      if (cRes.status === "fulfilled" && cRes.value?.success && cRes.value.complaints?.length) {
        setComps(cRes.value.complaints.map((c) => ({
          id: `C-${c.id}`,
          room: Number(c.room_number) || 101,
          guest: c.guest_name || "Guest",
          cat: "General",
          text: c.subject + (c.description ? ": " + c.description : ""),
          prio: "Normal",
          by: ME,
          status: c.status === "resolved" || c.status === "closed" ? "resolved" : "open",
          reply: "",
          created: c.created_at,
          resolved: c.resolved_at || "",
        })));
      }

      if (attRes.status === "fulfilled" && attRes.value?.success) {
        if (attRes.value.clockedIn) {
          setPunch({ in: Date.now() - 3600000, out: null });
        }
      }

      if (lRes.status === "fulfilled" && lRes.value?.success && lRes.value.requests?.length) {
        setLeaves(lRes.value.requests.map((lr) => ({
          id: lr.id,
          from: lr.start_date,
          to: lr.end_date,
          type: lr.leave_type,
          status: lr.status.charAt(0).toUpperCase() + lr.status.slice(1),
        })));
      }

      if (nRes.status === "fulfilled" && nRes.value?.success && nRes.value.notifications?.length) {
        const dbNotes = nRes.value.notifications.map((n) => ({
          id: n.id,
          type: n.title?.includes("Rating") ? "Rating" : n.title?.includes("Service") ? "Request" : "Room",
          text: `${n.title}: ${n.message || ""}`,
          time: String(n.created_at || "").slice(11, 16) || clock(),
          read: n.is_read,
        }));
        setNotes((prev) => {
          const ids = new Set(prev.map((x) => x.id));
          const newEntries = dbNotes.filter((x) => !ids.has(x.id));
          return [...newEntries, ...prev];
        });
      }
    } catch (err) {
      console.warn("Housekeeping fetch error:", err);
    }
  }, []);

  // Initial and periodic polling (every 4s) so tasks, DB service requests, and notifications update automatically
  useEffect(() => {
    refreshData();
    const interval = setInterval(() => {
      refreshData();
    }, 4000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Real-time cross-dashboard event listeners (Front Desk <-> Housekeeping)
  useEffect(() => {
    const handleNewSr = (data) => {
      if (!data || !data.room) return;
      const srObj = {
        id: data.id || `SR-${Date.now()}`,
        db_id: data.db_id || null,
        room: Number(data.room),
        guest: "Front Desk / Guest",
        type: data.type || data.category || "Service",
        desc: data.desc || data.description || "",
        prio: data.priority || "Normal",
        by: ME,
        status: "New",
        time: clock(),
        done: "",
      };
      setReqs((prev) => {
        if (prev.some((x) => x.id === srObj.id || (x.room === srObj.room && x.type === srObj.type && x.status !== "Completed"))) return prev;
        return [srObj, ...prev];
      });
      notify("Request", `New service request from Front Desk: Room ${data.room} - ${data.type || data.category || "Service"}`);
      toast(`New service request: Room ${data.room} (${data.type || data.category || "Service"})`);
      refreshData();
    };

    const handleRating = (data) => {
      if (!data) return;
      setRatings((prev) => [data, ...prev.filter((r) => r.id !== data.id)]);
      notify("Rating", `⭐ Front Desk rated your work ${data.rating}/5 stars for Room ${data.room}: "${data.comment}"`);
      toast(`⭐ New Rating Received! Front Desk rated you ${data.rating}/5 stars for Room ${data.room}!`);
    };

    const onSrCustom = (e) => handleNewSr(e.detail);
    const onRatingCustom = (e) => handleRating(e.detail);
    const onStorage = (e) => {
      if (e.key === "veyra_new_service_request" && e.newValue) {
        try { handleNewSr(JSON.parse(e.newValue)); } catch (err) {}
      }
      if (e.key === "veyra_hk_rating_feedback" && e.newValue) {
        try { handleRating(JSON.parse(e.newValue)); } catch (err) {}
      }
    };

    window.addEventListener("veyra_service_request_created", onSrCustom);
    window.addEventListener("veyra_rating_submitted", onRatingCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("veyra_service_request_created", onSrCustom);
      window.removeEventListener("veyra_rating_submitted", onRatingCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshData]);

  useEffect(() => { const t = setInterval(() => setTick(new Date()), 30000); return () => clearInterval(t); }, []);

  if (out) {
    return (
      <div className="hk login-wrap"><div className="login"><img src="/logo.png" alt="VEYRA Logo" className="hk-logo-img" /><h1>You have been logged out</h1>
        <p className="muted">Your session has ended.</p><button className="btn" onClick={() => { if (onLogout) onLogout(); else { setOut(false); setView("dashboard"); } }}>Sign in again</button></div></div>
    );
  }

  const mine = rooms.filter((r) => r.by === ME);
  const cnt = (...s) => mine.filter((r) => s.includes(r.status)).length;
  const pendingReq = reqs.filter((r) => r.status !== "Completed").length;
  const visNotes = notes.filter((n) => prefs[n.type] !== false), unread = visNotes.filter((n) => !n.read).length;
  const mins = punch.in ? Math.max(0, Math.round(((punch.out || Date.now()) - punch.in) / 60000)) : 0;
  const duty = punch.in && !punch.out ? "On Duty" : punch.out ? "Off Duty" : "Not checked in";
  const hour = tick.getHours(), greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const when = tick.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: !sys.h24 });
  const nowHM = tick.toTimeString().slice(0, 5);
  const finished = (s) => ["completed", "inspection", "ready"].includes(s);
  const overdue = (r) => r.due < nowHM && !finished(r.status) && r.status !== "maintenance";

  const start = async (r) => {
    upd(r.id, { status: "progress" });
    log(`Room ${r.id} cleaning started`);
    toast(`Room ${r.id}: cleaning started`);
    try {
      await housekeepingApi.startTask(r.id);
    } catch (err) {
      console.warn("Backend start task:", err);
    }
  };

  const chain = (id) => {
    step(id, "completed", "inspection", 1800, () => log(`Room ${id} sent for inspection`));
    step(id, "inspection", "ready", 8000, () => { log(`Room ${id} inspection completed`); notify("Room", `Room ${id} is clean and inspected`); });
  };

  // Complete cleaning task & trigger rating popup at Front Desk
  const finish = async (r) => {
    upd(r.id, { status: "completed", checked: all13 });
    setOpen(null);
    log(`Room ${r.id} cleaned`);
    toast(`Room ${r.id}: cleaning completed! Notifying Front Desk for rating...`);
    chain(r.id);

    // Notify Front Desk in real-time
    const taskEvent = {
      id: `TASK-${r.id}-${Date.now()}`,
      room: r.id,
      type: r.tt || "Room Cleaning",
      staff: me.name,
      ts: Date.now(),
    };
    try {
      localStorage.setItem("veyra_hk_completed_event", JSON.stringify(taskEvent));
      window.dispatchEvent(new CustomEvent("veyra_task_completed", { detail: taskEvent }));
    } catch (e) {}

    try {
      await housekeepingApi.completeTask(r.id);
      await refreshData();
    } catch (err) {
      console.warn("Backend complete task:", err);
    }
  };

  const toggle = (r, k) => upd(r.id, { checked: r.checked.includes(k) ? r.checked.filter((x) => x !== k) : [...r.checked, k], status: r.status === "assigned" ? "progress" : r.status });
  const resolveIssue = (r) => { setIssues((is) => is.map((i) => (i.room === r.id ? { ...i, status: "Resolved" } : i))); upd(r.id, { status: "completed", issue: null, checked: all13 }); log(`Room ${r.id} issue resolved`); toast("Issue resolved. Room cleaned."); chain(r.id); };
  const issueFor = (id) => { setIform({ ...iform, room: String(id || "") }); go("issue"); };
  const sendIssue = async () => {
    const id = Number(iform.room);
    if (!id || !iform.desc.trim()) return toast("Choose a room and add a description", "err");
    upd(id, { status: "maintenance", issue: iform.type });
    setIssues((is) => [{ id: `I-${is.length + 1}`, room: id, type: iform.type, desc: iform.desc, prio: iform.prio, at: iform.at.replace("T", " "), status: "Open" }, ...is]);
    log(`Room ${id} marked for maintenance`); notify("Maintenance", `Room ${id}: ${iform.type}`); toast("Issue reported");
    try {
      await housekeepingApi.requestMaintenance({ room_number: String(id), issue: `${iform.type}: ${iform.desc}` });
      // Notify Front Desk in real-time across components
      window.dispatchEvent(new CustomEvent("veyra_maintenance_reported", {
        detail: { room: id, issue: iform.type, desc: iform.desc, staff: me.name }
      }));
      await refreshData();
    } catch (err) {
      console.warn("Backend maintenance error:", err);
    }
    setIform({ room: "", type: ISSUES[0], desc: "", prio: "Normal", at: nowLocal(), file: "" });
  };

  // Advance Service Request: New -> In Progress -> Completed
  const advance = async (id) => {
    let targetDbId = null;
    let nextBackendStatus = "in_progress";
    let completedReq = null;

    setReqs((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      targetDbId = r.db_id || parseInt(String(id).replace(/\D/g, ""), 10);
      const isDone = r.status === "In Progress" || r.status === "Accepted";
      const nx = isDone ? "Completed" : "In Progress";
      nextBackendStatus = isDone ? "completed" : "in_progress";
      if (isDone) {
        completedReq = { ...r, status: "Completed", staff: me.name };
        log(`Service request ${id} completed`);
      } else {
        log(`Service request ${id} accepted and in progress`);
      }
      return { ...r, status: nx, by: ME, done: isDone ? clock() : "" };
    }));

    if (completedReq) {
      toast(`Service request for Room ${completedReq.room} completed! Notifying Front Desk for rating...`);
      const taskEvent = {
        id: `SR-${completedReq.room}-${Date.now()}`,
        room: completedReq.room,
        type: completedReq.type,
        staff: me.name,
        ts: Date.now(),
      };
      try {
        localStorage.setItem("veyra_hk_completed_event", JSON.stringify(taskEvent));
        window.dispatchEvent(new CustomEvent("veyra_task_completed", { detail: taskEvent }));
      } catch (e) {}
    }

    if (targetDbId) {
      try {
        await housekeepingApi.updateServiceRequest(targetDbId, nextBackendStatus);
        // Dispatch so Front Desk chart updates automatically and synchronously
        window.dispatchEvent(new CustomEvent("veyra_service_request_status_updated", { detail: { id: targetDbId, status: nextBackendStatus } }));
        await refreshData();
      } catch (e) {
        console.warn("Backend update service request error:", e);
      }
    }
  };

  // Deliver / Restock Supplies & create DB notification
  const deliverSupplies = async (reqId, items) => {
    setSreqs((prev) => prev.map((item) => item.id === reqId ? { ...item, status: "Restocked & Delivered" } : item));
    notify("Supplies", `Supplies Restocked: ${items || 'Requested items'} have been delivered & restocked.`);
    toast(`Supplies restocked and delivered to your section!`);
    setSup((prev) => prev.map((s) => ({ ...s, qty: s.qty + 25 })));

    try {
      await housekeepingApi.notifyRestock({ items });
      await refreshData();
    } catch (e) {
      console.warn("Restock notification error:", e);
    }
  };

  const sendSupplies = () => {
    const items = Object.entries(cart).filter(([, n]) => n > 0).map(([n, c]) => `${n} × ${c}`).join(", ");
    const reqId = Date.now();
    setSreqs((s) => [{ id: reqId, items, time: clock(), status: "Requested" }, ...s]);
    setCart({});
    toast("Supply request sent to hotel inventory");
    // Auto-restock simulation after 12 seconds so employee receives notification
    setTimeout(() => {
      deliverSupplies(reqId, items);
    }, 12000);
  };

  const filt = (arr, f) => arr.filter((r) => f === "all" || (f === "urgent" ? r.prio === "High" && !finished(r.status) : f === "todo" ? ["assigned", "required", "maintenance"].includes(r.status) : f === "progress" ? r.status === "progress" : finished(r.status)));
  const dismiss = (n) => setNotes(notes.map((x) => (x.id === n.id ? { ...x, read: true } : x)));

  return (
    <div className={`hk ${sys.compact ? "compact" : ""}`}>
      {/* SIDEBAR NAVIGATION - STREAMLINED FOR HOUSEKEEPING ACTIVITIES */}
      <aside className="side">
        <div className="brand">
          <img src="/logo.png" alt="VEYRA Logo" className="hk-logo-img" />
          <div>
            <b>VEYRA</b>
            <small>Housekeeping portal</small>
          </div>
        </div>
        <nav aria-label="Main" className="hk-side-nav">
          <div className="hk-nav-group">
            {NAV.map(([k, l, d]) => (
              <button key={k} className={`nav ${view === k ? "is-on" : ""}`} onClick={() => go(k, k === "profile" ? "view" : null)} aria-current={view === k ? "page" : undefined}>
                <Icon d={d} /><span>{l}</span>
                {k === "notifications" && unread > 0 && <em className="badge">{unread}</em>}
                {k === "requests" && pendingReq > 0 && <em className="badge soft">{pendingReq}</em>}
                {k === "rooms" && cnt("assigned", "progress") > 0 && <em className="badge soft">{cnt("assigned", "progress")}</em>}
              </button>
            ))}
          </div>
          <div className="hk-nav-bottom">
            <button className="nav logout" onClick={() => { if (onLogout) onLogout(); else setModal("logout"); }}>
              <Icon d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3 M16 15l4-4-4-4 M20 11H9" />
              <span>Log out</span>
            </button>
          </div>
        </nav>
      </aside>

      <div className="main">
        {/* HEADER */}
        <header className="top">
          <div><p>{greet}, {me.name.split(" ")[0]} · {when}</p></div>
          <div className="top-right">
            <span className={`pill ${duty === "On Duty" ? "on" : ""}`}>{duty}</span>
            <button className="bell" onClick={() => go("notifications")} aria-label={`${unread} notifications`}><Icon d={NAV[5][2]} />{unread > 0 && <em className="badge">{unread}</em>}</button>
            <div className="menu-wrap">
              <button className="who" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}><Avatar name={me.name} /><span><b>{me.name}</b><small>{me.role}</small></span></button>
              {menu && (<><div className="scrim" onClick={() => setMenu(false)} />
                <div className="dropdown" role="menu">
                  <div className="hk-menu-head">
                    <b>{me.name}</b>
                    <small>{me.role}</small>
                  </div>
                  <button onClick={() => go("profile", "view")}>View Profile</button><button onClick={() => go("profile", "edit")}>Edit Profile</button>
                  <button onClick={() => go("profile", "password")}>Change Password</button><button onClick={() => go("settings")}>Settings</button>
                  <button className="danger" onClick={() => { setMenu(false); if (onLogout) onLogout(); else setModal("logout"); }}>Logout</button>
                </div></>)}
            </div>
          </div>
        </header>

        <main className="page">
          <h2 className="page-title">{TITLES[view]}</h2>

          {/* OVERVIEW & ACTIVITIES TO DO */}
          {view === "dashboard" && (<>
            <div className="stats">
              <Stat label="Rooms to clean" value={cnt("assigned", "required")} tone="warn" onClick={() => go("rooms")} />
              <Stat label="Pending requests" value={pendingReq} tone={pendingReq > 0 ? "warn" : "blue"} onClick={() => go("requests")} />
              <Stat label="In progress" value={cnt("progress")} tone="blue" onClick={() => go("rooms")} />
              <Stat label="Clean & ready" value={cnt("completed", "inspection", "ready")} tone="good" onClick={() => go("rooms")} />
              <Stat label="Guest arrivals today" value={mine.filter((r) => r.stay.startsWith("Arrival")).length} />
              <Stat label="Guest checkouts today" value={mine.filter((r) => r.stay.startsWith("Checked")).length} />
              <Stat label="Reviews received" value={`${ratings.length} reviews`} tone="good" onClick={() => go("history")} />
              <Stat label="Overall rating" value="4.9 ★" tone="good" onClick={() => go("history")} />
            </div>

            <div className="cols">
              {/* PRIMARY ACTIVITIES TO DO SECTION */}
              <section className="panel">
                <div className="hk-todo-header">
                  <h3 className="hk-todo-title">
                    <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    Activities To Do
                    <span className="hk-todo-badge">
                      {pendingReq + mine.filter((r) => !finished(r.status)).length} Pending
                    </span>
                  </h3>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="link" onClick={() => go("requests")}>All Requests ({pendingReq})</button>
                    <span style={{ color: "var(--line)" }}>|</span>
                    <button className="link" onClick={() => go("rooms")}>My Rooms ({mine.length})</button>
                  </div>
                </div>

                <div className="hk-todo-section">
                  {/* SERVICE REQUESTS FROM FRONT DESK / GUESTS */}
                  {reqs.filter((r) => r.status !== "Completed").map((sr) => (
                    <div key={sr.id} className={`hk-todo-card ${sr.prio === "High" ? "priority-high" : ""}`}>
                      <div className="hk-todo-room">{sr.room}</div>
                      <div className="hk-todo-info">
                        <div className="hk-todo-meta">
                          <span className="hk-todo-name">{sr.type}</span>
                          <span className={`tag ${sr.prio === "High" ? "tag-rush" : "tag-plain"}`}>{sr.prio} Priority</span>
                          <span className={`tag tag-${sr.status === "New" ? "todo" : "progress"}`}>{sr.status}</span>
                        </div>
                        <p className="hk-todo-desc">
                          Requested by {sr.guest} at {sr.time} · {sr.desc || "Guest service required"}
                        </p>
                      </div>
                      <button
                        className={`hk-todo-btn ${sr.status === "In Progress" ? "btn-complete" : ""}`}
                        onClick={() => advance(sr.id)}
                      >
                        {sr.status === "New" && "Accept Request"}
                        {sr.status === "Accepted" && "Start Service"}
                        {sr.status === "In Progress" && "Complete Service"}
                      </button>
                    </div>
                  ))}

                  {/* ROOMS ASSIGNED TO CLEAN */}
                  {mine.filter((r) => !finished(r.status)).sort((a, b) => (b.prio === "High") - (a.prio === "High")).map((r) => (
                    <div key={r.id} className={`hk-todo-card ${r.prio === "High" ? "priority-high" : ""}`}>
                      <div className="hk-todo-room">{r.id}</div>
                      <div className="hk-todo-info">
                        <div className="hk-todo-meta">
                          <span className="hk-todo-name">{r.tt || "Room Cleaning"}</span>
                          <span className="hk-lux-floor">Floor {Math.floor(r.id / 100)} · {r.rt}</span>
                          <Tag s={r.status} />
                          {r.prio === "High" && <span className="tag tag-rush">High Priority</span>}
                        </div>
                        <p className="hk-todo-desc">
                          {r.stay} · Due {r.due} · {r.checked.length}/13 checklist done
                        </p>
                      </div>
                      <button
                        className="hk-todo-btn"
                        onClick={() => {
                          if (r.status === "assigned" || r.status === "required") start(r);
                          go("rooms");
                          setOpen(r.id);
                        }}
                      >
                        {r.status === "progress" ? "Continue (Open)" : "Start Cleaning"}
                      </button>
                    </div>
                  ))}

                  {reqs.filter((r) => r.status !== "Completed").length === 0 &&
                   mine.every((r) => finished(r.status)) && (
                    <div style={{ textAlign: "center", padding: "32px 20px" }}>
                      <div style={{ fontSize: "2rem", marginBottom: 6 }}>✨</div>
                      <b style={{ color: "var(--navy)", fontSize: "1.05rem" }}>All activities are completed!</b>
                      <p className="muted" style={{ marginTop: 4 }}>Outstanding work Anita. All assigned rooms are clean and service requests fulfilled.</p>
                    </div>
                  )}
                </div>
              </section>

              {/* RECENT RATINGS & ACTIVITIES */}
              <div className="stack">
                <section className="panel">
                  <div className="panel-h">
                    <h3>Recent Front Desk Ratings</h3>
                    <button className="link" onClick={() => go("history")}>View all</button>
                  </div>
                  {ratings.slice(0, 2).map((rv) => (
                    <div key={rv.id} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <b style={{ color: "var(--navy)", fontSize: "0.92rem" }}>Room {rv.room} · {rv.type}</b>
                        <span style={{ color: "var(--gold)", fontWeight: 700 }}>{"★".repeat(rv.rating)}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: "0.84rem", fontStyle: "italic", color: "#444" }}>"{rv.comment}"</p>
                      <small className="muted">{rv.time} · Front Desk Handover</small>
                    </div>
                  ))}
                </section>

                <section className="panel">
                  <div className="panel-h">
                    <h3>Recent Activity</h3>
                  </div>
                  <ul className="lines">
                    {acts.map(([t, tm], i) => (
                      <li key={i}>
                        <span>{t}</span>
                        <small className="muted">{tm}</small>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          </>)}

          {/* MY ROOMS - BRAND NEW LUXURY HOTEL LOOK */}
          {view === "rooms" && (<>
            <div className="hk-lux-bar">
              <div className="hk-staff-badge">
                <span className="hk-staff-dot" />
                <div>
                  <b style={{ color: "var(--navy)", fontSize: "1.05rem" }}>Assigned to {me.name}</b>
                  <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                    Floor 1 & 2 Section · {mine.filter((r) => !finished(r.status)).length} to clean, {mine.filter((r) => finished(r.status)).length} clean & ready
                  </div>
                </div>
              </div>
              <div className="hk-lux-tabs">
                {[
                  ["all", `All (${mine.length})`],
                  ["todo", `To Do (${mine.filter((r) => ["assigned", "required", "maintenance"].includes(r.status)).length})`],
                  ["progress", `In Progress (${mine.filter((r) => r.status === "progress").length})`],
                  ["done", `Clean & Ready (${mine.filter((r) => finished(r.status)).length})`],
                  ["urgent", `High Priority (${mine.filter((r) => r.prio === "High" && !finished(r.status)).length})`],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    className={rfilter === k ? "active" : ""}
                    onClick={() => setRfilter(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {filt(mine, rfilter).length === 0 && (
              <div className="panel" style={{ textAlign: "center", padding: "40px 20px" }}>
                <p className="empty">No rooms match the selected filter.</p>
              </div>
            )}

            <div className="hk-lux-grid">
              {filt(mine, rfilter).map((r) => {
                const isClean = finished(r.status);
                const isProg = r.status === "progress";
                const isMaint = r.status === "maintenance";
                const isFull = r.checked.length === 13;
                const pct = Math.round((r.checked.length / 13) * 100);
                const isExpanded = open === r.id;

                let cardClass = "status-required";
                if (isClean) cardClass = "status-clean";
                else if (isProg) cardClass = "status-progress";
                else if (isMaint) cardClass = "status-maintenance";

                return (
                  <div key={r.id} className={`hk-lux-card ${cardClass}`}>
                    {/* Card Head */}
                    <div className="hk-lux-card-head">
                      <div className="hk-lux-room-box">
                        <div className="hk-lux-room-num">{r.id}</div>
                        <div className="hk-lux-room-meta">
                          <span className="hk-lux-type">{r.rt} Room</span>
                          <span className="hk-lux-floor">Floor {Math.floor(r.id / 100)} · Door {r.id}</span>
                          <span className="hk-lux-stay">{r.stay}{r.g ? ` · ${r.g}` : ""}</span>
                        </div>
                      </div>
                      <div className="hk-lux-badges">
                        <Tag s={r.status} />
                        {r.prio === "High" && !isClean && (
                          <span className="tag tag-rush">★ High Priority</span>
                        )}
                        {overdue(r) && <span className="tag tag-rush">Overdue</span>}
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="hk-lux-card-body">
                      <div className="hk-lux-task-strip">
                        <span className="hk-lux-task-name">
                          <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                          {r.tt || "Room Turnover"}
                        </span>
                        <span className="hk-lux-task-time">
                          ⏱ ~{TT[r.tt] || 30} min · Due {r.due}
                        </span>
                      </div>

                      {r.inst && (
                        <div className="hk-lux-instruction">
                          📌 <b>Special Instructions:</b> {r.inst}
                        </div>
                      )}

                      {/* Checklist Progress Bar */}
                      <div className="hk-lux-prog-wrap">
                        <div className="hk-lux-prog-head">
                          <span>Checklist Progress</span>
                          <span style={{ color: isFull ? "var(--ok)" : "var(--navy)" }}>
                            {r.checked.length} of 13 done ({pct}%)
                          </span>
                        </div>
                        <div className="hk-lux-prog-track">
                          <div
                            className="hk-lux-prog-fill"
                            style={{
                              width: `${pct}%`,
                              background: isFull ? "var(--ok)" : isProg ? "linear-gradient(90deg, var(--gold) 0%, #E5C358 100%)" : "#D4AF37",
                            }}
                          />
                        </div>
                      </div>

                      {/* Expandable Checklist Box */}
                      <div className="hk-checklist-box">
                        <div className="hk-checklist-toolbar">
                          <button
                            type="button"
                            className="link"
                            style={{ fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: 4 }}
                            onClick={() => setOpen(isExpanded ? null : r.id)}
                          >
                            <Icon d={isExpanded ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                            {isExpanded ? "Collapse Checklist" : "Expand Checklist (13 Items)"}
                          </button>
                          {!isClean && (
                            <button
                              type="button"
                              className="link"
                              style={{ fontSize: "0.8rem", color: "var(--ok)" }}
                              onClick={() => {
                                upd(r.id, { checked: all13, status: r.status === "assigned" ? "progress" : r.status });
                                toast(`Room ${r.id}: all checklist items marked complete!`);
                              }}
                            >
                              Check All (13/13)
                            </button>
                          )}
                        </div>

                        {isExpanded ? (
                          <div className="hk-checklist-grid">
                            {CHECKLIST.map((t, k) => {
                              const done = r.checked.includes(k);
                              return (
                                <label key={t} className={`hk-chk-item ${done ? "checked" : ""}`}>
                                  <input
                                    type="checkbox"
                                    checked={done}
                                    disabled={isClean || isMaint}
                                    onChange={() => toggle(r, k)}
                                  />
                                  <span>{t}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: "0.78rem" }}>
                            {CHECKLIST.slice(0, 3).map((t, k) => (
                              <span
                                key={t}
                                style={{
                                  background: r.checked.includes(k) ? "var(--oksoft)" : "#F2EFE8",
                                  color: r.checked.includes(k) ? "var(--ok)" : "var(--muted)",
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  fontWeight: 500,
                                }}
                              >
                                {r.checked.includes(k) ? "✓" : "○"} {t}
                              </span>
                            ))}
                            {CHECKLIST.length > 3 && (
                              <button
                                className="link"
                                style={{ fontSize: "0.78rem" }}
                                onClick={() => setOpen(r.id)}
                              >
                                +{CHECKLIST.length - 3} more...
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div className="hk-lux-card-foot">
                      {r.status === "assigned" && (
                        <button className="hk-lux-btn-main" onClick={() => start(r)}>
                          <Icon d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          Start Cleaning
                        </button>
                      )}

                      {r.status === "progress" && (
                        <button
                          className={`hk-lux-btn-main ${isFull ? "ready-to-complete" : ""}`}
                          onClick={() => finish(r)}
                        >
                          <Icon d="M5 13l4 4L19 7" />
                          {isFull ? "Complete Cleaning & Rate" : `Complete Cleaning (${13 - r.checked.length} left)`}
                        </button>
                      )}

                      {r.status === "maintenance" && (
                        <button className="hk-lux-btn-main" onClick={() => resolveIssue(r)}>
                          <Icon d="M5 13l4 4L19 7" />
                          Mark Issue Resolved
                        </button>
                      )}

                      {isClean && (
                        <div style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--ok)", fontWeight: 700, fontSize: "0.9rem" }}>
                          <Icon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          Clean & Ready for Inspection
                        </div>
                      )}

                      {!isClean && !isMaint && (
                        <button className="hk-lux-btn-sec" onClick={() => issueFor(r.id)}>
                          <Icon d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          Report Issue
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>)}

          {/* SERVICE REQUESTS VIEW - STEPPER & ACTIONS */}
          {view === "requests" && (
            <div className="rq-list">
              {reqs.length === 0 && <p className="empty">No service requests yet.</p>}
              {reqs.map((r) => {
                const si = RSTEPS.indexOf(r.status);
                return (
                  <article key={r.id} className={`rq ${r.status === "Completed" ? "is-done" : ""}`}>
                    <span className="rq-room"><small>Room</small>{r.room}</span>
                    <div className="rq-main">
                      <div className="rq-title">
                        <b>{r.type}</b>
                        <Prio p={r.prio} />
                        <small className="muted">{r.id} · {r.guest}</small>
                      </div>
                      <ol className="rq-steps">{RSTEPS.map((s, i) => <li key={s} className={i < si ? "done" : i === si ? "now" : ""}><i />{s}</li>)}</ol>
                      <small className="muted">Requested {r.time} · {r.by ? `Assigned to ${STAFF[r.by] || me.name}` : "Unassigned"}{r.done && ` · Completed ${r.done}`}</small>
                    </div>
                    {r.status !== "Completed" && (r.by === ME || !r.by) ? (
                      <button className="btn" onClick={() => advance(r.id)}>
                        {{ New: "Accept Request", Accepted: "Start Service", "In Progress": "Complete Service" }[r.status] || "Accept Request"}
                      </button>
                    ) : (
                      <span className="rq-end" style={{ color: "var(--ok)", fontWeight: 700 }}>
                        ✓ {r.status === "Completed" ? "Done & Rated" : "Other staff"}
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {/* MY HISTORY & PERFORMANCE RATINGS VIEW */}
          {view === "history" && (<>
            {/* KPI Performance Summary */}
            <div className="hk-hist-summary">
              <div className="hk-hist-card">
                <span className="hk-hist-label">Rooms Cleaned Today</span>
                <span className="hk-hist-val">{mine.filter((r) => finished(r.status)).length}</span>
                <span className="hk-hist-sub">✓ 100% Quality Standard</span>
              </div>
              <div className="hk-hist-card">
                <span className="hk-hist-label">Requests Fulfilled</span>
                <span className="hk-hist-val">{reqs.filter((r) => r.status === "Completed").length}</span>
                <span className="hk-hist-sub">Avg completion &lt; 15 min</span>
              </div>
              <div className="hk-hist-card">
                <span className="hk-hist-label">Overall Rating</span>
                <span className="hk-hist-val" style={{ color: "var(--gold)" }}>4.9 ★</span>
                <span className="hk-hist-sub">Based on {ratings.length} reviews</span>
              </div>
              <div className="hk-hist-card">
                <span className="hk-hist-label">Shift Hours</span>
                <span className="hk-hist-val">{hm(mins)}</span>
                <span className="hk-hist-sub">{duty} · {me.shift}</span>
              </div>
            </div>

            <div className="cols">
              {/* Front Desk Ratings & Performance Reviews */}
              <section className="panel">
                <div className="panel-h">
                  <h3>Front Desk & Guest Ratings ({ratings.length})</h3>
                  <span className="tag tag-ready">Excellent Performance</span>
                </div>

                {ratings.length === 0 && (
                  <p className="empty">No ratings recorded yet. Completed tasks will appear here once rated.</p>
                )}

                <div className="hk-rating-feed">
                  {ratings.map((rv) => (
                    <article key={rv.id} className="hk-rating-card">
                      <div className="hk-rating-top">
                        <div>
                          <span className="hk-rating-room">Room {rv.room} · {rv.type}</span>
                          <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: 2 }}>
                            Housekeeper: <b>{rv.staff || me.name}</b>
                          </div>
                        </div>
                        <div className="hk-rating-stars">
                          {"★".repeat(rv.rating)}{"☆".repeat(5 - rv.rating)}
                        </div>
                      </div>

                      {rv.comment && (
                        <p className="hk-rating-comment">"{rv.comment}"</p>
                      )}

                      {rv.tags && rv.tags.length > 0 && (
                        <div className="hk-rating-tags">
                          {rv.tags.map((tg) => (
                            <span key={tg} className="hk-rating-tag">✓ {tg}</span>
                          ))}
                        </div>
                      )}

                      <div className="hk-rating-footer">
                        <span>Submitted by Front Desk Officer</span>
                        <span>{rv.time || "Today"}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {/* Completed Tasks & Requests Timeline */}
              <section className="panel">
                <div className="panel-h">
                  <h3>Completed Cleanings Log</h3>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {mine.filter((r) => finished(r.status)).map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FAF8F3", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                      <div>
                        <b style={{ color: "var(--navy)", fontSize: "0.95rem" }}>Room {r.id} · {r.tt}</b>
                        <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 2 }}>
                          {r.rt} · 13/13 checklist verified · {r.stay}
                        </div>
                      </div>
                      <span className="tag tag-done">Clean & Ready</span>
                    </div>
                  ))}

                  {reqs.filter((r) => r.status === "Completed").map((sr) => (
                    <div key={sr.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FAF8F3", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
                      <div>
                        <b style={{ color: "var(--navy)", fontSize: "0.95rem" }}>Room {sr.room} · {sr.type}</b>
                        <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 2 }}>
                          Fulfilled by {me.name} · Completed {sr.done || sr.time}
                        </div>
                      </div>
                      <span className="tag tag-done">Service Delivered</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>)}

          {/* SUPPLIES & RESTOCK VIEW */}
          {view === "supplies" && (
            <div className="cols">
              <section className="panel"><div className="scroll"><table><thead><tr><th>Item</th><th>Available</th><th>Minimum</th><th>Request</th></tr></thead>
                <tbody>{sup.map((s) => (
                  <tr key={s.n}><td>{s.n} {s.qty < s.min && <span className="tag tag-rush">Low stock</span>}</td><td><b>{s.qty}</b></td><td>{s.min}</td>
                    <td><span className="step"><button aria-label={`Less ${s.n}`} onClick={() => setCart({ ...cart, [s.n]: Math.max(0, (cart[s.n] || 0) - 1) })}>−</button><b>{cart[s.n] || 0}</b><button aria-label={`More ${s.n}`} onClick={() => setCart({ ...cart, [s.n]: (cart[s.n] || 0) + 1 })}>+</button></span></td></tr>))}</tbody></table></div>
                <button className="btn" disabled={!Object.values(cart).some((n) => n > 0)} onClick={sendSupplies}>Request supplies</button></section>
              <section className="panel">
                <div className="panel-h"><h3>Your requests</h3></div>
                {sreqs.length === 0 && <p className="empty">No requests yet.</p>}
                <ul className="lines">{sreqs.map((s) => (
                  <li key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <b>{s.items}</b>
                      <small className="block">{s.time}</small>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={`tag ${s.status === "Requested" ? "tag-progress" : "tag-done"}`}>{s.status}</span>
                      {s.status === "Requested" && (
                        <button className="btn btn-sm" style={{ padding: "5px 12px", fontSize: "0.8rem" }} onClick={() => deliverSupplies(s.id, s.items)}>
                          Restock & Deliver Now
                        </button>
                      )}
                    </div>
                  </li>
                ))}</ul>
              </section>
            </div>
          )}

          {/* ATTENDANCE & SHIFT */}
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

          {/* REPORT ISSUE VIEW */}
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

          {/* NOTIFICATIONS VIEW */}
          {view === "notifications" && (
            <section className="panel"><div className="panel-h"><span className="muted">{unread} unread</span><button className="link" onClick={() => setNotes(notes.map((n) => ({ ...n, read: true })))}>Mark all read</button></div>
              {visNotes.length === 0 && <p className="empty">No notifications.</p>}
              <ul className="lines">{visNotes.map((n) => <li key={n.id} className={n.read ? "" : "unread"} onClick={() => dismiss(n)}><span><span className="tag tag-plain">{n.type}</span> {n.text}</span><small className="muted">{n.time}</small></li>)}</ul></section>
          )}

          {/* PROFILE VIEW */}
          {view === "profile" && (<>
            <section className="panel prof"><Avatar name={me.name} big />
              <div className="prof-grid"><h2>{me.name}</h2>
                {[["Employee ID", me.id], ["Role", me.role], ["Department", me.dept], ["Phone", me.phone], ["Email", me.email], ["Assigned", me.area], ["Duty status", duty], ["Working hours", hm(mins)]].map(([k, v]) => <p key={k}><small>{k}</small>{v}</p>)}</div></section>
            <div className="tabs wrap">{[["view", "View Profile"], ["edit", "Edit Profile"], ["password", "Change Password"]].map(([k, l]) => <button key={k} className={ptab === k ? "is-on" : ""} onClick={() => { setPtab(k); setEdit({}); }}>{l}</button>)}<button onClick={() => go("attendance")}>Attendance</button></div>
            {ptab === "edit" && <section className="panel form"><label>Name<input value={edit.name ?? me.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label><label>Phone<input value={edit.phone ?? me.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label><label>Email<input value={edit.email ?? me.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
              <button className="btn" onClick={() => { setMe({ ...me, ...edit }); setEdit({}); toast("Profile updated"); }}>Save changes</button></section>}
            {ptab === "password" && <section className="panel"><PasswordForm pw={me.pw} onSave={(pw) => { setMe({ ...me, pw }); toast("Password changed"); }} /></section>}
          </>)}

          {/* SETTINGS VIEW */}
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
            <div className="two"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-danger" onClick={() => { setModal(null); if (onLogout) onLogout(); else setOut(true); }}>Logout</button></div></div>
        </div>)}
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}</div>
    </div>
  );
}
