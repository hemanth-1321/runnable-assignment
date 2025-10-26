import { Sandbox } from "@e2b/code-interpreter";
import { compareFilesWithPrompt } from "./findrelavnt";

const E2B_API_KEY = process.env.E2B_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!E2B_API_KEY) throw new Error("E2B_API_KEY is not set");
if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not set");

export interface CloneResult {
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>;
  cloneDir: string;
  candidateFiles: string[];
  keywords: string[];
  prUrl?: string;
}

interface GitHubPRResponse {
  html_url: string;
  [key: string]: any;
}

export async function cloneRepoAndSuggestFiles(
  repoUrl: string,
  userPrompt: string,
  baseDir = "/home/user/project",
  upstreamRepoFullName?: string, // original repo
  forkFullName?: string // your fork
): Promise<CloneResult> {
  console.log("Creating E2B sandbox...");
  const sandbox = await Sandbox.create({
    apiKey: E2B_API_KEY,
    timeoutMs: 30 * 60 * 1000,
  });
  console.log(`Sandbox created with ID: ${sandbox.sandboxId}`);

  const repoName = repoUrl.split("/").pop()!.replace(".git", "");
  const cloneDir = `${baseDir}/${repoName}`;

  // Ensure git is installed
  const gitCheck = await sandbox.commands.run("git --version", {
    timeoutMs: 15000,
  });
  if (gitCheck.exitCode !== 0) {
    console.log("Installing git...");
    await sandbox.commands.run("apt-get update -y && apt-get install -y git", {
      timeoutMs: 120000,
    });
  }

  // Clone the fork
  await sandbox.commands.run(`rm -rf ${baseDir}`);
  await sandbox.commands.run(`mkdir -p ${baseDir}`);
  const cloneResult = await sandbox.commands.run(
    `git clone ${repoUrl} ${cloneDir}`,
    { timeoutMs: 300000 }
  );
  if (cloneResult.exitCode !== 0)
    throw new Error(`Failed to clone repo: ${cloneResult.stderr}`);
  console.log("✓ Repository cloned successfully!");

  // Extract keywords
  const keywords = extractKeywords(userPrompt);
  if (keywords.length === 0)
    return { sandbox, cloneDir, candidateFiles: [], keywords: [] };
  const pattern = keywords.join("\\|");

  // Search files
  const grepCmd = `grep -rl "${pattern}" ${cloneDir} --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude-dir=coverage --exclude-dir=__pycache__ --exclude="*.log" --exclude="*.map" --exclude="*.lock" --exclude="package-lock.json" --exclude="yarn.lock" 2>/dev/null || true`;
  const searchResult = await sandbox.commands.run(grepCmd, {
    timeoutMs: 30000,
  });

  const foundFiles = searchResult.stdout
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  const candidateFiles = foundFiles.slice(0, 10);

  // Read candidate file contents
  const fileContents = new Map<string, string>();
  for (const file of candidateFiles) {
    try {
      const content = await sandbox.files.read(file);
      fileContents.set(file, content);
    } catch (err) {
      console.error(`Failed to read file ${file}:`, err);
    }
  }

  // Run AI to compare & update files
  const aiResult = await compareFilesWithPrompt(
    userPrompt,
    fileContents,
    sandbox
  );

  let prUrl: string | undefined;

  if (aiResult.filesToModify?.length > 0) {
    console.log("💾 Committing and pushing AI changes...");
    if (!upstreamRepoFullName || !forkFullName)
      throw new Error("Missing upstream/fork info for PR");

    const branchName = `ai-edits-${Date.now()}`;

    await sandbox.commands.run(`git config --global user.name "hemanth-1321"`);
    await sandbox.commands.run(
      `git config --global user.email "hemanth02135@gmail.com"`
    );
    await sandbox.commands.run(
      `cd ${cloneDir} && git checkout -b ${branchName}`
    );

    // Write modified files
    for (const file of aiResult.filesToModify) {
      if (file.filePath && file.newContent) {
        await sandbox.files.write(file.filePath, file.newContent);
      }
    }

    // Commit & push
    await sandbox.commands.run(`cd ${cloneDir} && git add .`);
    await sandbox.commands.run(
      `cd ${cloneDir} && git commit -m "AI applied changes: ${userPrompt}" || echo "No changes to commit"`
    );
    const repoWithToken = repoUrl.replace(
      "https://",
      `https://${GITHUB_TOKEN}@`
    );
    await sandbox.commands.run(
      `cd ${cloneDir} && git push ${repoWithToken} HEAD:${branchName}`
    );

    // Create PR on upstream
    try {
      const pr = await createPullRequest(
        upstreamRepoFullName,
        `${forkFullName.split("/")[0]}:${branchName}`,
        `AI applied changes: ${userPrompt}`,
        `This PR contains AI-suggested changes:\n\n${userPrompt}`
      );
      prUrl = pr.html_url;
      console.log(`✅ Pull Request created: ${prUrl}`);
    } catch (err) {
      console.error("⚠️ Failed to create PR:", err);
    }
  } else {
    console.log("⚠️ No files modified by AI. Skipping commit and PR.");
  }

  return { sandbox, cloneDir, candidateFiles, keywords, prUrl };
}

// ------------------ PR CREATION ------------------

async function createPullRequest(
  repoFullName: string,
  head: string,
  title: string,
  body: string
): Promise<GitHubPRResponse> {
  const response = await fetch(
    `https://api.github.com/repos/${repoFullName}/pulls`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({ title, head, base: "main", body }),
    }
  );

  const data = (await response.json()) as GitHubPRResponse;
  if (!response.ok)
    throw new Error(`Failed to create PR: ${JSON.stringify(data)}`);
  if (!data.html_url) throw new Error("PR creation failed: html_url missing");

  return data;
}

// ------------------ UTILS ------------------

function extractKeywords(prompt: string): string[] {
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
