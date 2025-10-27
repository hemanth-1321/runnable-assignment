import express from "express";
import { z } from "zod";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import cors from "cors";
const REDIS_URL = process.env.REDIS_URL!;

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.json());
const connection = new IORedis(REDIS_URL);
const jobQueue = new Queue("fork-edit-queue", { connection });

const inputSchema = z.object({
  githuburl: z.url(),
  prompt: z.string().min(5),
});

app.post("/create", async (req, res) => {
  try {
    const { githuburl, prompt } = inputSchema.parse(req.body);

    const job = await jobQueue.add("fork-edit", { githuburl, prompt });

    res.json({ success: true, jobId: job.id });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(8000, () => {
  console.log("Server running on port 8000");
});
