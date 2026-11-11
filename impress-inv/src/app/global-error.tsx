"use client";

// Last safety net: used only when the whole app (including the main layout) fails. It replaces the root
// layout, so it carries its own html/body and plain styles.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f4f5",
          fontFamily: "system-ui, sans-serif",
          color: "#18181b",
        }}
      >
        <div
          style={{
            maxWidth: 420,
            margin: 16,
            padding: 32,
            background: "#fff",
            borderRadius: 8,
            textAlign: "center",
            boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
          }}
        >
          <h1 style={{ fontSize: 20, margin: 0 }}>The application hit a problem</h1>
          <p style={{ fontSize: 14, color: "#52525b", marginTop: 8 }}>
            Your data is safe. Please try again. If it keeps happening, close and open the application.
          </p>
          {error.digest && <p style={{ fontSize: 12, color: "#a1a1aa" }}>Error code: {error.digest}</p>}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 24px",
              border: 0,
              borderRadius: 6,
              background: "#dc8307",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
