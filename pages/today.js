// pages/today.js
import Link from "next/link";
import JobCard from "../components/JobCard";
import { loadAllJobs, splitTodayAndOld } from "../lib/jobs";

export async function getStaticProps() {
  const allJobs = loadAllJobs();
  const { today } = splitTodayAndOld(allJobs);
  return { props: { jobs: today } };
}

export default function TodayPage({ jobs }) {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "24px 16px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Today's Bank Jobs</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        {jobs.length} new job{jobs.length === 1 ? "" : "s"} posted today
      </p>

      <nav style={{ marginBottom: 20 }}>
        <Link href="/today" style={{ marginRight: 16, fontWeight: 700 }}>
          Today
        </Link>
        <Link href="/all-jobs">All Jobs</Link>
      </nav>

      {jobs.length === 0 && (
        <p style={{ color: "#888" }}>
          No new bank jobs posted today yet. Check back later or see{" "}
          <Link href="/all-jobs">All Jobs</Link>.
        </p>
      )}

      {jobs.map((job) => (
        <JobCard key={job.link} job={job} />
      ))}
    </main>
  );
}
