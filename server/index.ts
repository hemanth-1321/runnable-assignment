import express from "express";
import { z } from "zod";
import { Queue, QueueEvents, Job } from "bullmq";
import IORedis from "ioredis";
import cors from "cors";

const REDIS_URL = process.env.REDIS_URL!;
const QUEUE_NAME = "fork-edit-queue";

const app = express();
app.use(express.json());
app.use(cors());

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

const jobQueue = new Queue(QUEUE_NAME, { connection });

// Input validation
const inputSchema = z.object({
  githuburl: z.url(),
  prompt: z.string().min(5),
});

// Add job endpoint
app.post("/create", async (req, res) => {
  try {
    const { githuburl, prompt } = inputSchema.parse(req.body);

    const job = await jobQueue.add(
      "fork-edit",
      { githuburl, prompt },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    console.log("Job queued:", job.id);
    res.json({ success: true, jobId: job.id });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// SSE endpoint for live job status
app.get("/events/:jobId", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const jobId = req.params.jobId;
  const queueEvents = new QueueEvents(QUEUE_NAME, { connection });
  await queueEvents.waitUntilReady(); // wait for connection

  console.log("Listening for events on job:", jobId);

  // Keep-alive ping
  const interval = setInterval(() => {
    res.write("event: ping\n");
    res.write("data: keepalive\n\n");
  }, 15000);

  // --- Helper to send SSE data ---
  const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // --- Fetch current job state immediately ---
  try {
    const job = await jobQueue.getJob(jobId);
    if (!job) {
      send({ status: "not_found" });
      clearInterval(interval);
      return res.end();
    }

    const state = await job.getState();
    if (state === "completed") {
      send({ status: "completed", result: await job.returnvalue });
      clearInterval(interval);
      return res.end();
    } else if (state === "failed") {
      send({ status: "failed", failedReason: job.failedReason });
      clearInterval(interval);
      return res.end();
    } else {
      send({ status: "pending" }); // job is waiting or active
    }
  } catch (err) {
    console.error("Error fetching job:", err);
    send({ status: "error", message: err });
    clearInterval(interval);
    return res.end();
  }

  // --- Event listeners ---
  const onCompleted = async ({ jobId: completedJobId }: any) => {
    if (String(completedJobId) === String(jobId)) {
      const job = await jobQueue.getJob(jobId);
      send({ status: "completed", result: job?.returnvalue });
      clearInterval(interval);
      queueEvents.off("completed", onCompleted);
      queueEvents.off("failed", onFailed);
      res.end();
    }
  };

  const onFailed = ({ jobId: failedJobId, failedReason }: any) => {
    if (String(failedJobId) === String(jobId)) {
      send({ status: "failed", failedReason });
      clearInterval(interval);
      queueEvents.off("completed", onCompleted);
      queueEvents.off("failed", onFailed);
      res.end();
    }
  };

  queueEvents.on("completed", onCompleted);
  queueEvents.on("failed", onFailed);

  // --- Cleanup on client disconnect ---
  req.on("close", () => {
    clearInterval(interval);
    queueEvents.off("completed", onCompleted);
    queueEvents.off("failed", onFailed);
    console.log("SSE connection closed by client");
  });
});

app.listen(8000, () => {
  console.log("Server running on port 8000");
});
