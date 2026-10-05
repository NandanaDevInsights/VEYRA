import React, { useState, useEffect, useCallback } from "react";
import Login from "./login";
import "./homelogin.css";

const slides = [
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1600&q=80",
  "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1600&q=80",
  "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=1600&q=80",
  "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1600&q=80",
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1600&q=80",
  "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=1600&q=80",
];

const departments = [
  {
    icon: "ti-door",
    title: "Front desk",
    desc: "Bookings, room allocation, and digital check-in passes.",
  },
  {
    icon: "ti-sparkles",
    title: "Housekeeping",
    desc: "Real-time room status across every floor.",
  },
  {
    icon: "ti-file-invoice",
    title: "Billing",
    desc: "Itemized invoices and organized payment records.",
  },
];

const stats = [
  { icon: "ti-bed", value: "128", label: "ROOMS MANAGED" },
  { icon: "ti-users", value: "42", label: "STAFF ACCOUNTS" },
  { icon: "ti-building", value: "4", label: "DEPARTMENTS" },
  { icon: "ti-chart-pie", value: "94%", label: "CURRENT OCCUPANCY" },
];

/**
 * HomeLoginAction
 * Same visual layout as HomeLogin, but every element on the page is
 * non-interactive EXCEPT the Login button. Clicking Login swaps the
 * home page out for the Login component directly (no routing needed).
 */
export default function HomeLoginAction() {
  const [current, setCurrent] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  // Carousel auto-rotates on its own — not user-triggered, so it stays active
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLoginClick = useCallback(() => {
    setShowLogin(true);
  }, []);

  // Once Login is triggered, render only the Login component
  if (showLogin) {
    return <Login />;
  }

  return (
    <div className="home-page" aria-disabled="true">
      {/* Nav — brand is display-only, Login is the only active control */}
      <nav className={`home-nav ${scrolled ? "home-nav--scrolled" : ""}`}>
        <div className="brand" style={{ pointerEvents: "none" }}>
          <div className="brand-badge">
            <i className="ti ti-building-skyscraper" aria-hidden="true"></i>
          </div>
          <span className="brand-name">The Grandview Hotel</span>
        </div>
        <button className="login-btn" onClick={handleLoginClick}>
          LOGIN
        </button>
      </nav>

      {/* Carousel — auto-plays only, no manual controls */}
      <div className="carousel" style={{ pointerEvents: "none" }}>
        <div
          className="carousel-track"
          style={{
            width: `${slides.length * 100}%`,
            transform: `translateX(-${current * (100 / slides.length)}%)`,
          }}
        >
          {slides.map((src, i) => (
            <div
              key={i}
              className="carousel-slide"
              style={{
                width: `${100 / slides.length}%`,
                backgroundImage: `url(${src})`,
              }}
            ></div>
          ))}
        </div>

        <div className="carousel-caption">
          <span className="eyebrow">STAFF PORTAL</span>
          <h1>
            Every stay,
            <br />
            <em>precisely</em> managed.
          </h1>
          <p className="carousel-subtitle">
            One system for bookings, rooms, and service — from arrival to
            departure.
          </p>
        </div>

        {/* Dots are visual indicators only — not clickable */}
        <div className="carousel-dots">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`dot ${i === current ? "active" : ""}`}
              style={{ cursor: "default" }}
            ></span>
          ))}
        </div>

        <div className="scroll-hint">
          <i className="ti ti-chevron-down" aria-hidden="true"></i>
        </div>
      </div>

      {/* Section 1 — System overview stats (display only) */}
      <section className="stats-section" style={{ pointerEvents: "none" }}>
        <div className="section-inner">
          <p className="section-label">SYSTEM OVERVIEW</p>
          <h2 className="section-heading">
            Everything the front of house needs, in one place.
          </h2>

          <div className="stats-row">
            {stats.map((stat, i) => (
              <div className="stat" key={i}>
                <i className={`ti ${stat.icon} stat-icon`} aria-hidden="true"></i>
                <p className="stat-value">{stat.value}</p>
                <p className="stat-label">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 2 — Departments (display only) */}
      <section className="departments-section" style={{ pointerEvents: "none" }}>
        <div className="section-inner">
          <p className="section-label">BUILT FOR EVERY DEPARTMENT</p>
          <h2 className="section-heading">
            One platform, four teams, zero paperwork.
          </h2>

          <div className="dept-grid">
            {departments.map((dept, i) => (
              <div className="dept-card" key={i}>
                <i className={`ti ${dept.icon}`} aria-hidden="true"></i>
                <p className="dept-title">{dept.title}</p>
                <p className="dept-desc">{dept.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer — informational only, no clickable links */}
      <footer className="home-footer" style={{ pointerEvents: "none" }}>
        <div className="footer-grid">
          <div>
            <span className="footer-brand">The Grandview Hotel</span>
            <p className="footer-about">
              Internal staff system for front desk, housekeeping, billing,
              and administration.
            </p>
          </div>

          <div>
            <p className="footer-heading">CONTACT</p>
            <p className="footer-line">
              <i className="ti ti-phone" aria-hidden="true"></i>
              +91 484 220 1145
            </p>
            <p className="footer-line">
              <i className="ti ti-mail" aria-hidden="true"></i>
              frontdesk@grandview.com
            </p>
            <p className="footer-line">
              <i className="ti ti-map-pin" aria-hidden="true"></i>
              Kozhikode, Kerala
            </p>
          </div>

          <div>
            <p className="footer-heading">SUPPORT</p>
            <p className="footer-line">IT Helpdesk</p>
            <p className="footer-line">Staff Handbook</p>
            <p className="footer-line">Report an Issue</p>
          </div>
        </div>

        <div className="footer-bottom">
          <p>Internal use only &middot; The Grandview Hotel</p>
        </div>
      </footer>
    </div>
  );
}