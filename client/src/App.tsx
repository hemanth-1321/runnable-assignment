"use client";

import React, { useState, useEffect } from "react";
import type { FormEvent } from "react";
import {
  Github,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Terminal,
  Link2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { BACKEND_URL } from "./config";

interface MessageState {
  type: "success" | "error" | "" | "progress";
  text: string;
}

interface ApiResponse {
  success: boolean;
  jobId?: string;
  error?: string;
}

export default function App(): React.ReactElement {
  const [githubUrl, setGithubUrl] = useState("");
  const [submittedRepo, setSubmittedRepo] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<MessageState>({ type: "", text: "" });
  const [jobId, setJobId] = useState<string | null>(null);
  const [stage, setStage] = useState(0);

  const progressMessages = [
    "⏳ Queued... your job is in line.",
    "🔍 Cloning repository...",
    "🤖 Starting the AI agent...",
    "🧠 Thinking and applying changes...",
    "🚀 Creating Pull Request...",
    "✅ Finalizing...",
  ];

  useEffect(() => {
    if (!jobId) return;

    const eventSource = new EventSource(`${BACKEND_URL}/events/${jobId}`);
    setMessage({ type: "progress", text: "Job started... preparing..." });

    let stageTimeout: ReturnType<typeof setTimeout>;
    setStage(0);

    const delays = [5000, 6000, 7000, 15000, 9000];
    let index = 0;

    const advanceStage = () => {
      setStage((prev) =>
        prev < progressMessages.length - 1 ? prev + 1 : prev
      );
      if (index < delays.length) {
        stageTimeout = setTimeout(advanceStage, delays[index]);
        index++;
      }
    };
    stageTimeout = setTimeout(advanceStage, delays[index]);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.status === "completed") {
        clearTimeout(stageTimeout);
        setMessage({
          type: "success",
          text: "🎉 Job completed successfully! Check your PR on GitHub.",
        });
        setLoading(false);
        eventSource.close();
      } else if (data.status === "failed") {
        clearTimeout(stageTimeout);
        setMessage({
          type: "error",
          text: `❌ Job failed: ${data.failedReason || "Unknown error"}`,
        });
        setLoading(false);
        eventSource.close();
      }
    };

    eventSource.onerror = (err) => {
      console.error("SSE connection error:", err);
      clearTimeout(stageTimeout);
      setMessage({
        type: "error",
        text: "⚠️ Lost connection to server. Please refresh or retry.",
      });
      setLoading(false);
      eventSource.close();
    };

    return () => {
      clearTimeout(stageTimeout);
      eventSource.close();
    };
  }, [jobId]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const response = await fetch(`${BACKEND_URL}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githuburl: githubUrl, prompt }),
      });

      const data: ApiResponse = await response.json();
      if (data.success && data.jobId) {
        setJobId(data.jobId);
        setSubmittedRepo(githubUrl);
        setMessage({
          type: "progress",
          text: `Job created (ID: ${data.jobId}). Preparing to start...`,
        });
        setGithubUrl("");
        setPrompt("");
      } else {
        throw new Error(data.error || "Failed to create job");
      }
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
      setLoading(false);
    }
  };

  const reset = () => {
    setJobId(null);
    setMessage({ type: "", text: "" });
    setLoading(false);
    setStage(0);
    setSubmittedRepo(null);
  };

  // Subtle blinking bar animation
  const Blinker = () => (
    <span className="inline-block w-0.5 h-4 bg-black animate-pulse ml-1" />
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white text-black px-6 py-12 font-mono relative">
      {/* subtle vertical lines */}
      <div className="absolute inset-y-0 left-1/5 w-px bg-gray-200"></div>
      <div className="absolute inset-y-0 right-1/5 w-px bg-gray-200"></div>

      <div className="w-full max-w-2xl flex flex-col items-center text-center">
        {/* Header */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <Terminal className="w-6 h-6" />
          <h1 className="text-2xl font-semibold tracking-tight">
            AI Code Agent
          </h1>
        </div>

        {/* Repo URL shown above progress */}
        {submittedRepo && (
          <code className="bg-gray-100 px-3 py-2 rounded text-sm mb-4 border border-gray-200">
            <Link2 className="inline-block w-4 h-4 mr-1 text-gray-500" />
            {submittedRepo}
          </code>
        )}

        {!jobId ? (
          <form
            onSubmit={handleSubmit}
            className="w-full flex flex-col gap-6 text-left"
          >
            <div>
              <label className="text-sm font-medium mb-1 block">
                GitHub Repository URL
              </label>
              <Input
                type="url"
                placeholder="https://github.com/username/repository"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                required
                className="border border-black rounded-none bg-transparent"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Instructions
              </label>
              <Textarea
                placeholder="Describe the issue or change you want the agent to make..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                required
                minLength={5}
                rows={5}
                className="border border-black rounded-none bg-transparent"
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !githubUrl || prompt.length < 5}
              className="bg-black text-white w-full rounded-none py-2 hover:bg-gray-900 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <Github className="w-4 h-4 mr-2" />
                  Run Agent
                </>
              )}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col items-center justify-center gap-6 py-10 min-h-[300px]">
            {message.type === "progress" && (
              <>
                <Loader2 className="w-8 h-8 animate-spin text-black" />
                <p className="text-sm text-gray-700">
                  {progressMessages[stage] || message.text}
                  <Blinker />
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  This might take a few minutes. Sit tight ☕
                </p>
              </>
            )}

            {message.type === "success" && (
              <>
                <CheckCircle2 className="w-8 h-8 text-green-600" />
                <p className="text-sm text-green-700">{message.text}</p>
                <Button
                  onClick={reset}
                  variant="outline"
                  className="rounded-none border-black"
                >
                  Run another task
                </Button>
              </>
            )}

            {message.type === "error" && (
              <>
                <AlertCircle className="w-8 h-8 text-red-600" />
                <p className="text-sm text-red-700">{message.text}</p>
                <Button
                  onClick={reset}
                  variant="outline"
                  className="rounded-none border-black"
                >
                  Try again
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
