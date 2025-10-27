import React, { useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, CheckCircle2, Github, Loader2 } from "lucide-react";

// Type for success/error messages
interface MessageState {
  type: "success" | "error" | "";
  text: string;
}

// Type for API response
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

  // Form submission handler
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const response = await fetch("http://localhost:8000/create", {
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
          text: `Job created successfully. Job ID: ${data.jobId}`,
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <Github className="w-8 h-8 text-gray-900" />
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                GitHub Fork Editor
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Fork and edit repositories with AI assistance
              </p>
            </div>
          </div>

          {/* FORM */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* GitHub URL input */}
            <div>
              <label
                htmlFor="githuburl"
                className="block text-sm font-medium text-gray-700 mb-2"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md 
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Instructions textarea */}
            <div>
              <label
                htmlFor="prompt"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Instructions
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the changes you want to make..."
                required
                minLength={5}
                rows={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-md 
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading || !githubUrl || prompt.length < 5}
              className="w-full bg-gray-900 text-white py-2.5 px-4 rounded-md font-medium 
              hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 
              focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed 
              transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Submit Job"
              )}
            </button>
          </form>

          {/* Message */}
          {message.text && (
            <div
              className={`mt-6 p-4 rounded-md flex items-start gap-3 ${
                message.type === "success"
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <p
                className={`text-sm ${
                  message.type === "success" ? "text-green-800" : "text-red-800"
                }`}
              >
                {message.text}
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          Jobs are processed asynchronously via BullMQ
        </p>
      </div>
    </div>
  );
}
