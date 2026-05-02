import axios from "axios";
import dotenv from "dotenv";
import Log from "../logging_middleware/logger.js";

dotenv.config();

const BASE = "http://20.207.122.201/evaluation-service";
const headers = () => ({ Authorization: `Bearer ${process.env.ACCESS_TOKEN}` });

const WEIGHT = { Placement: 3, Result: 2, Event: 1 };

const main = async () => {
  await Log("backend", "info", "service", "fetching priority inbox");

  const { data } = await axios.get(`${BASE}/notifications`, {
    headers: headers(),
  });
  const notifications = data.notifications;

  const top = [...notifications]
    .sort((a, b) => {
      const byWeight = WEIGHT[b.Type] - WEIGHT[a.Type];
      if (byWeight !== 0) return byWeight;
      return new Date(b.Timestamp) - new Date(a.Timestamp);
    })
    .slice(0, 10);

  console.log(`\nTop ${top.length} notifications:\n`);
  top.forEach((n, i) =>
    console.log(`${i + 1}. [${n.Type}] ${n.Message} - ${n.Timestamp}`),
  );

  await Log("backend", "info", "service", `done - showed top ${top.length}`);
};

main().catch(async (err) => {
  await Log("backend", "fatal", "service", `crashed - ${err.message}`);
  console.error(err);
});
