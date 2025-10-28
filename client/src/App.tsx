import React, { useState } from "react";
import type { FormEvent } from "react";
import {
  Github,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Terminal,
} from "lucide-react";
import { BACKEND_URL, LOCAL_URL } from "./config";

interface MessageState {
  type: "success" | "error" | "";
  text: string;
}

interface ApiResponse {
  success: boolean;
  jobId?: string;
  error?: string;
}

export default function App(): React.ReactElement {
  const [githubUrl, setGithubUrl] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<MessageState>({ type: "", text: "" });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const response = await fetch(`${LOCAL_URL}/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ githuburl: githubUrl, prompt }),
      });

      const data: ApiResponse = await response.json();

      if (data.success) {
        setMessage({
          type: "success",
          text: `Task created successfully. Job ID: ${data.jobId}`,
        });
        setGithubUrl("");
        setPrompt("");
      } else {
        throw new Error(data.error || "Failed to create job");
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      setMessage({ type: "error", text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col items-center justify-center px-6 py-12">
      {/* HEADER */}
      <div className="w-full max-w-2xl mb-10 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Terminal className="w-6 h-6 text-gray-900" />
          <h1 className="text-2xl font-semibold tracking-tight">
            AI Code Agent
          </h1>
        </div>
        <p className="text-sm text-gray-500">
          Automatically clone repositories, resolve issues, and create pull
          requests.
        </p>
      </div>

      {/* FORM */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl flex flex-col gap-6"
      >
        {/* GitHub URL input */}
        <div>
          <label
            htmlFor="githuburl"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            GitHub Repository URL
          </label>
          <input
            type="url"
            id="githuburl"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/username/repository"
            required
            className="w-full px-3 py-2 bg-gray-100 border border-transparent rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>

        {/* Prompt textarea */}
        <div>
          <label
            htmlFor="prompt"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Instructions
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the issue or change you want the agent to make..."
            required
            minLength={5}
            rows={5}
            className="w-full px-3 py-2 bg-gray-100 border border-transparent rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black resize-none"
          />
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={loading || !githubUrl || prompt.length < 5}
          className="w-full bg-black text-white py-2.5 rounded-md font-medium hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Github className="w-5 h-5" />
              Run Agent
            </>
          )}
        </button>
      </form>

      {/* Message */}
      {message.text && (
        <div
          className={`mt-8 text-sm flex items-center gap-2 ${
            message.type === "success" ? "text-green-600" : "text-red-600"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span>{message.text}</span>
        </div>
      )}
    </div>
  );
}
