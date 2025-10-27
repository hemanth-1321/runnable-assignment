import { Sandbox } from "@e2b/code-interpreter";
import { compareFilesWithPrompt } from "./compareAndUpdateFiles";
import { createPullRequest, extractKeywords } from "../utils/helper";

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

  const keywords = extractKeywords(userPrompt);
  if (keywords.length === 0)
    return { sandbox, cloneDir, candidateFiles: [], keywords: [] };

  const pattern = keywords.join("\\|");

  const grepCmd = `grep -rl "${pattern}" ${cloneDir} --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude-dir=coverage --exclude-dir=__pycache__ --exclude="*.log" --exclude="*.map" --exclude="*.lock" --exclude="package-lock.json" --exclude="yarn.lock" 2>/dev/null || true`;
  const searchResult = await sandbox.commands.run(grepCmd, {
    timeoutMs: 30000,
  });

  const candidateFiles = searchResult.stdout
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .slice(0, 10);

  const fileContents = new Map<string, string>();
  for (const file of candidateFiles) {
    try {
      const content = await sandbox.files.read(file);
      fileContents.set(file, content);
    } catch (err) {
      console.error("error", err);
    }
  }

  const aiResult = await compareFilesWithPrompt(
    userPrompt,
    fileContents,
    sandbox
  );
  let prUrl: string | undefined;

  if (aiResult.filesToModify?.length > 0) {
    if (!upstreamRepoFullName || !forkFullName)
      throw new Error("Missing upstream/fork info for PR");

    const branchName = `ai-edits-${Date.now()}`;
    await sandbox.commands.run(
      `git config --global user.name ${process.env.GITHUB_USERNAME}`
    );
    await sandbox.commands.run(
      `git config --global user.email ${process.env.GITHUB_EMAIL}`
    );
    await sandbox.commands.run(
      `cd ${cloneDir} && git checkout -b ${branchName}`
    );

    for (const file of aiResult.filesToModify) {
      if (file.filePath && file.newContent)
        await sandbox.files.write(file.filePath, file.newContent);
    }

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

    try {
      const pr = await createPullRequest(
        upstreamRepoFullName,
        `${forkFullName.split("/")[0]}:${branchName}`,
        `AI applied changes: ${userPrompt}`,
        `This PR contains AI-suggested changes:\n\n${userPrompt}`
      );
      prUrl = pr.html_url;
    } catch {
      console.error("error creating pr");
    }
  }

  return { sandbox, cloneDir, candidateFiles, keywords, prUrl };
}
