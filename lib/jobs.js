// lib/jobs.js
import fs from "fs";
import path from "path";

export function loadAllJobs() {
  const filePath = path.join(process.cwd(), "public", "jobs.json");
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// "Today" = posted date matches today's date (local calendar day)
export function splitTodayAndOld(jobs) {
  const todayStr = new Date().toDateString();

  const today = [];
  const old = [];

  for (const job of jobs) {
    const postedStr = job.postedDate
      ? new Date(job.postedDate).toDateString()
      : null;

    if (postedStr === todayStr) {
      today.push(job);
    } else {
      old.push(job);
    }
  }

  return { today, old };
}
