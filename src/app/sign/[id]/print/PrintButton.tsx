"use client";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} style={{ marginLeft: "auto", font: "inherit", padding: "6px 12px", borderRadius: 6, border: "1px solid #999", background: "#fff", cursor: "pointer" }}>
      列印／存成 PDF
    </button>
  );
}
