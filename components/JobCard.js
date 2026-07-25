// components/JobCard.js
export default function JobCard({ job }) {
  const postedLabel = job.postedDate
    ? new Date(job.postedDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  const isApply = job.type === "APPLY";

  return (
    <div
      style={{
        border: "1px solid #e2e2e2",
        borderRadius: 10,
        padding: "16px 18px",
        marginBottom: 14,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
        {job.source} · {postedLabel}
      </div>
      <h3 style={{ margin: "0 0 12px 0", fontSize: 17, lineHeight: 1.4 }}>
        {job.title}
      </h3>
      
        href={job.link}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          padding: "8px 16px",
          borderRadius: 6,
          fontWeight: 600,
          fontSize: 14,
          textDecoration: "none",
          color: isApply ? "#fff" : "#1a1a1a",
          background: isApply ? "#0f766e" : "#f0f0f0",
          border: isApply ? "none" : "1px solid #ccc",
        }}
      >
        {isApply ? "APPLY →" : "VIEW DETAILS →"}
      </a>
    </div>
  );
}
