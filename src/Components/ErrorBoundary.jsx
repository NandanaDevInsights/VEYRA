import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", background: "#FAF9F6",
          fontFamily: "'Inter', sans-serif", padding: 24, textAlign: "center"
        }}>
          <div style={{
            background: "#fff", border: "1px solid #E7E3D8", borderTop: "4px solid #C9A227",
            borderRadius: 16, padding: "36px 40px", maxWidth: 540, boxShadow: "0 10px 30px rgba(0,0,0,0.06)"
          }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", color: "#1B2A4A", margin: "0 0 10px" }}>
              Dashboard Notice
            </h2>
            <p style={{ color: "#6B6B63", fontSize: 14, margin: "0 0 20px", lineHeight: 1.6 }}>
              A temporary display error was encountered while rendering this view.
              {this.state.error?.message && <span style={{ display: "block", color: "#b33a3a", marginTop: 8, fontSize: 13, fontFamily: "monospace" }}>{this.state.error.message}</span>}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
                style={{
                  background: "#1B2A4A", color: "#fff", border: "none",
                  padding: "10px 22px", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13.5
                }}
              >
                Reload Dashboard
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem("veyra_token");
                    localStorage.removeItem("veyra_user");
                  } catch (e) {}
                  window.location.reload();
                }}
                style={{
                  background: "transparent", color: "#1B2A4A", border: "1px solid #E7E3D8",
                  padding: "10px 22px", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13.5
                }}
              >
                Sign In Again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
