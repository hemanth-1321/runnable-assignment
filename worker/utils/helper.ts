import { Octokit } from "@octokit/rest";

interface GitHubPRResponse {
  html_url: string;
  [key: string]: any;
}
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export const formatFilesForAI = (fileContents: Map<string, string>) => {
  return Array.from(fileContents.entries())
    .map(
      ([path, content], index) =>
        `File ${index + 1}: ${path}\n\`\`\`\n${content}\n\`\`\``
    )
    .join("\n\n");
};

export const extractJsonFromText = (text: string) => {
  const jsonMatch =
    text.match(/```json\n([\s\S]*?)\n```/) ||
    text.match(/```\n([\s\S]*?)\n```/);
  const jsonText: string = jsonMatch?.[1] ?? text;
  try {
    return JSON.parse(jsonText);
  } catch {
    return {
      filesToModify: [],
      analysis: text,
      rawResponse: text,
    };
  }
};

export const diffStrings = (oldStr: string, newStr: string) => {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  return newLines
    .map((line, i) =>
      line !== oldLines[i] ? `- ${oldLines[i] ?? ""}\n+ ${line}` : null
    )
    .filter(Boolean)
    .join("\n");
};

export async function createPullRequest(
  repoFullName: string,
  head: string,
  title: string,
  body: string
): Promise<GitHubPRResponse> {
  if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not set");

  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  const parts = repoFullName.split("/");
  if (parts.length !== 2)
    throw new Error(`Invalid repoFullName: ${repoFullName}`);
  const [owner, repo] = parts;

  const { data } = await octokit.pulls.create({
    owner: owner!,
    repo: repo!,
    title,
    head,
    base: "main",
    body,
  });

  if (!data.html_url) throw new Error("PR creation failed: html_url missing");
  return data as GitHubPRResponse;
}

export function extractKeywords(prompt: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "update",
    "change",
    "modify",
    "fix",
    "add",
    "remove",
    "delete",
  ]);
  const words = prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
  return [...new Set(words)];
}
