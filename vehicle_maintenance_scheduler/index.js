import axios from "axios";
import dotenv from "dotenv";
import Log from "../logging_middleware/logger.js";

dotenv.config();

const BASE = "http://20.207.122.201/evaluation-service";
const headers = () => ({ Authorization: `Bearer ${process.env.ACCESS_TOKEN}` });

const getDepots = async () => {
  const { data } = await axios.get(`${BASE}/depots`, { headers: headers() });
  return data.depots;
};

const getVehicles = async () => {
  const { data } = await axios.get(`${BASE}/vehicles`, { headers: headers() });
  return data.vehicles;
};

const scheduleTasks = (tasks, budget) => {
  const n = tasks.length;
  const dp = Array.from({ length: n + 1 }, () => Array(budget + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    const { Duration, Impact } = tasks[i - 1];
    for (let w = 0; w <= budget; w++) {
      const without = dp[i - 1][w];
      const with_ = Duration <= w ? dp[i - 1][w - Duration] + Impact : 0;
      dp[i][w] = Math.max(without, with_);
    }
  }

  const picked = [];
  let w = budget;
  for (let i = n; i > 0; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      picked.push(tasks[i - 1]);
      w -= tasks[i - 1].Duration;
    }
  }

  return { picked, totalImpact: dp[n][budget] };
};

const main = async () => {
  await Log("backend", "info", "service", "Scheduler started");

  const [depots, vehicles] = await Promise.all([getDepots(), getVehicles()]);
  await Log(
    "backend",
    "info",
    "service",
    `${depots.length} depots, ${vehicles.length} vehicles fetched`,
  );

  for (const depot of depots) {
    const { picked, totalImpact } = scheduleTasks(
      vehicles,
      depot.MechanicHours,
    );

    console.log(
      `\nDepot ${depot.ID} | Budget: ${depot.MechanicHours}h | Total Impact: ${totalImpact}`,
    );
    picked.forEach((t) =>
      console.log(`  → ${t.TaskID} | ${t.Duration}h | impact: ${t.Impact}`),
    );

    await Log(
      "backend",
      "info",
      "service",
      `Depot ${depot.ID} - ${picked.length} tasks, impact: ${totalImpact}`,
    );
  }

  await Log("backend", "info", "service", "Scheduler finished");
};

main().catch(async (err) => {
  await Log(
    "backend",
    "fatal",
    "service",
    `Scheduler crashed - ${err.message}`,
  );
  console.error(err);
});
