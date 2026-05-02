import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const LOG_API = "http://20.207.122.201/evaluation-service/logs";

const VALID_STACKS = ["backend", "frontend"];
const VALID_LEVELS = ["debug", "info", "warn", "error", "fatal"];

const BACKEND_PACKAGES = [
  "cache",
  "controller",
  "cron_job",
  "db",
  "domain",
  "handler",
  "repository",
  "route",
  "service",
];

const FRONTEND_PACKAGES = [
  "api",
  "component",
  "hook",
  "page",
  "state",
  "style",
];

const COMMON_PACKAGES = ["auth", "config", "middleware", "utils"];

const getAllowedPackages = (stack) =>
  stack === "backend"
    ? [...BACKEND_PACKAGES, ...COMMON_PACKAGES]
    : [...FRONTEND_PACKAGES, ...COMMON_PACKAGES];

const Log = async (stack, level, pkg, message) => {
  const s = stack.toLowerCase();
  const l = level.toLowerCase();
  const p = pkg.toLowerCase();

  if (!VALID_STACKS.includes(s)) {
    console.error(`[Log] Invalid stack: "${s}"`);
    return;
  }

  if (!VALID_LEVELS.includes(l)) {
    console.error(`[Log] Invalid level: "${l}"`);
    return;
  }

  if (!getAllowedPackages(s).includes(p)) {
    console.error(`[Log] Invalid package "${p}" for stack "${s}"`);
    return;
  }

  try {
    await axios.post(
      LOG_API,
      { stack: s, level: l, package: p, message },
      {
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error(`[Log] API call failed - ${err.message}`);
  }
};

export default Log;
