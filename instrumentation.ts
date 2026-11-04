// Runs once when the server starts, which is what gives service reminders a background timer.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startPushScheduler } = await import("./lib/push");
  startPushScheduler();
}
