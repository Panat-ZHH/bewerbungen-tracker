// Netlify scheduled function: calls the protected digest route once a day (07:00 UTC = 08:00/09:00 in Switzerland).
export const config = { schedule: "0 7 * * *" };

const handler = async () => {
  const base = (process.env.APP_URL || process.env.URL || "").replace(/\/$/, "");
  const secret = process.env.REMINDERS_CRON_SECRET;
  if (!base || !secret) { console.log("reminders-digest: APP_URL/URL or REMINDERS_CRON_SECRET missing, skipped"); return; }
  const res = await fetch(`${base}/api/reminders/digest`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
  console.log("reminders-digest:", res.status);
};

export default handler;
