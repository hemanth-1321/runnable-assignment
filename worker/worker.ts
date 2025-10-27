import { Worker } from "bullmq";
import { forkAndEditRepo } from "./index";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL!;

// ✅ Fix: disable retries for BullMQ
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const worker = new Worker(
  "fork-edit-queue",
  async (job) => {
    const { githuburl, prompt } = job.data;
    console.log(`Processing job ${job.id} for repo ${githuburl}`);

    try {
      const result = await forkAndEditRepo(githuburl, prompt);
      console.log(`Job ${job.id} completed for repo ${githuburl}`);
      return result;
    } catch (err: any) {
      console.error(`Job ${job.id} failed:`, err.message || err);
      throw err;
    }
  },
  {
    connection,
    concurrency: 1,
  }
);

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err);
});

console.log("🚀 Worker is running and listening for jobs...");
