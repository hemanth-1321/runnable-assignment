import { Sandbox } from "@e2b/code-interpreter";
import { codeEditorGraph } from "../nodes/graph";
import { createPullRequest } from "../utils/helper";
import type { GraphState } from "../utils/state";

const E2B_API_KEY = process.env.E2B_API_KEY!;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME!;
const GITHUB_EMAIL = process.env.GITHUB_EMAIL!;

export interface CloneResult {
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>;
  cloneDir: string;
  prUrl?: string;
}

export async function cloneRepoAndSuggestFiles(
  repoUrl: string,
  userPrompt: string,
  baseDir = "/home/user/project",
  upstreamRepoFullName?: string,
  forkFullName?: string
): Promise<CloneResult> {
  const sandbox = await Sandbox.create({
    apiKey: E2B_API_KEY,
    timeoutMs: 30 * 60 * 1000,
  });

  const repoName = repoUrl.split("/").pop()!.replace(".git", "");
  const cloneDir = `${baseDir}/${repoName}`;

  // Ensure git is available
  const gitCheck = await sandbox.commands.run("git --version", {
    timeoutMs: 15000,
  });
  if (gitCheck.exitCode !== 0) {
    await sandbox.commands.run("apt-get update -y && apt-get install -y git", {
      timeoutMs: 120000,
    });
  }

  await sandbox.commands.run(`rm -rf ${baseDir}`);
  await sandbox.commands.run(`mkdir -p ${baseDir}`);

  const cloneResult = await sandbox.commands.run(
    `git clone ${repoUrl} ${cloneDir}`,
    { timeoutMs: 300000 }
  );
  if (cloneResult.exitCode !== 0)
    throw new Error(`Failed to clone repo: ${cloneResult.stderr}`);

  const initialState: GraphState = {
    prompt: userPrompt,
    repoPath: cloneDir,
    sandbox,
    searchMode: "grep",
    filePaths: [],
    fileContents: {},
    relevantFiles: [],
    changePlan: [],
    diff: "",
    applyResult: null,
    summary: "",
    error: "",
    attempts: 0,
    validationAttempts: 0,
    validationSuccess: false,
    filesToModify: [],
  };

  console.log("Starting graph execution...");
  const graphResult = await codeEditorGraph.invoke(initialState);

  console.log("Graph result keys:", Object.keys(graphResult));

  // Extract values properly
  const aiResult = Array.isArray(graphResult.filesToModify)
    ? graphResult.filesToModify
    : (graphResult.filesToModify as any)?.value || [];

  const isValid =
    typeof graphResult.validationSuccess === "boolean"
      ? graphResult.validationSuccess
      : (graphResult.validationSuccess as any)?.value ?? true;

  console.log(`Files to modify: ${aiResult.length}`);
  console.log(`Validation status: ${isValid}`);

  // Check if there's an error in the graph
  if (graphResult.error) {
    console.error("Graph execution error:", graphResult.error);
    return { sandbox, cloneDir };
  }

  // Check if we have any changes to commit
  const statusCheck = await sandbox.commands.run(
    `cd ${cloneDir} && git status --porcelain`
  );
  const hasGitChanges = statusCheck.stdout.trim().length > 0;

  if (!hasGitChanges && aiResult.length === 0) {
    console.warn("No changes detected. Skipping PR creation.");
    return { sandbox, cloneDir };
  }

  let prUrl: string | undefined;

  if (!upstreamRepoFullName || !forkFullName) {
    console.error("Missing upstream/fork info for PR");
    throw new Error("Missing upstream/fork info for PR");
  }

  const branchName = `ai-edits-${Date.now()}`;
  console.log(`Creating branch: ${branchName}`);

  // Configure git
  await sandbox.commands.run(
    `git config --global user.name "${GITHUB_USERNAME}"`
  );
  await sandbox.commands.run(
    `git config --global user.email "${GITHUB_EMAIL}"`
  );
  await sandbox.commands.run(`cd ${cloneDir} && git checkout -b ${branchName}`);

  // Show what files were changed
  console.log("Checking git status...");
  const statusResult = await sandbox.commands.run(
    `cd ${cloneDir} && git status --short`
  );
  console.log("Git status:\n", statusResult.stdout);

  // Files are ALREADY written by applyChangesPartial, just commit them
  console.log("Committing changes...");
  await sandbox.commands.run(`cd ${cloneDir} && git add -A`);

  const commitResult = await sandbox.commands.run(
    `cd ${cloneDir} && git commit -m "AI applied changes: ${userPrompt}"`
  );

  if (commitResult.exitCode !== 0) {
    console.error("Commit failed:", commitResult.stderr);

    // Try creating an empty commit if nothing to commit
    console.log("Creating empty commit as fallback...");
    await sandbox.commands.run(
      `cd ${cloneDir} && git commit --allow-empty -m "AI applied changes: ${userPrompt}"`
    );
  } else {
    console.log("Commit successful:", commitResult.stdout);
  }

  // Push to fork
  const forkOwner = forkFullName.split("/")[0];
  const forkRepoUrl = repoUrl.replace("https://", `https://${GITHUB_TOKEN}@`);

  console.log(`Pushing to fork: ${forkFullName}...`);
  const pushResult = await sandbox.commands.run(
    `cd ${cloneDir} && git push ${forkRepoUrl} HEAD:${branchName} --force`
  );

  if (pushResult.exitCode !== 0) {
    console.error("Push failed:", pushResult.stderr);
    throw new Error(`Failed to push: ${pushResult.stderr}`);
  }

  console.log("Push successful");

  // Create PR
  try {
    console.log("Creating pull request...");
    const pr = await createPullRequest(
      upstreamRepoFullName,
      `${forkOwner}:${branchName}`,
      `AI applied changes: ${userPrompt}`,
      `This PR contains AI-suggested changes:\n\n${userPrompt}`
    );
    prUrl = pr.html_url;
    console.log("PR created successfully:", prUrl);
  } catch (err: any) {
    console.error("PR creation failed:", err?.response?.data || err.message);
    throw err;
  }

  return { sandbox, cloneDir, prUrl };
}
