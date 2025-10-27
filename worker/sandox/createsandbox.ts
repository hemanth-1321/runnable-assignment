import { Sandbox } from "@e2b/code-interpreter";
import { compareFilesWithPrompt } from "./compareAndUpdateFiles";
import { createPullRequest } from "../utils/helper";

const E2B_API_KEY = process.env.E2B_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!E2B_API_KEY) throw new Error("E2B_API_KEY is not set");
if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not set");

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

  const gitCheck = await sandbox.commands.run("git --version", { timeoutMs: 15000 });
  if (gitCheck.exitCode !== 0) {
    await sandbox.commands.run("apt-get update -y && apt-get install -y git", {
      timeoutMs: 120000,
    });
  }

  await sandbox.commands.run(`rm -rf ${baseDir}`);
  await sandbox.commands.run(`mkdir -p ${baseDir}`);

  const cloneResult = await sandbox.commands.run(`git clone ${repoUrl} ${cloneDir}`, {
    timeoutMs: 300000,
  });
  if (cloneResult.exitCode !== 0) throw new Error(`Failed to clone repo: ${cloneResult.stderr}`);

  const aiResult = await compareFilesWithPrompt(userPrompt, sandbox, cloneDir);

  let prUrl: string | undefined;

  if (aiResult.filesToModify?.length > 0) {
    if (!upstreamRepoFullName || !forkFullName)
      throw new Error("Missing upstream/fork info for PR");

    const branchName = `ai-edits-${Date.now()}`;

    await sandbox.commands.run(`git config --global user.name "${process.env.GITHUB_USERNAME}"`);
    await sandbox.commands.run(`git config --global user.email "${process.env.GITHUB_EMAIL}"`);

    await sandbox.commands.run(`cd ${cloneDir} && git checkout -b ${branchName}`);

    let changesMade = false;
    for (const file of aiResult.filesToModify) {
      if (file.filePath && file.newContent) {
        try {
          let oldContent = "";
          try {
            oldContent = await sandbox.files.read(file.filePath);
          } catch {}
          if (oldContent !== file.newContent) {
            await sandbox.files.write(file.filePath, file.newContent);
            changesMade = true;
          }
        } catch (err) {
          console.error(`Failed to write file ${file.filePath}:`, err);
        }
      }
    }

    if (changesMade) {
      await sandbox.commands.run(`cd ${cloneDir} && git add .`);
      await sandbox.commands.run(
        `cd ${cloneDir} && git commit -m "AI applied changes: ${userPrompt}"`
      );
    } else {
      await sandbox.commands.run(
        `cd ${cloneDir} && git commit --allow-empty -m "AI applied changes (no diff)"`
      );
    }

    const forkOwner = forkFullName.split("/")[0];
    const forkRepoUrl = repoUrl.replace("https://", `https://${GITHUB_TOKEN}@`);
    await sandbox.commands.run(
      `cd ${cloneDir} && git push ${forkRepoUrl} HEAD:${branchName} --force`
    );

      const status = await sandbox.commands.run(`cd ${cloneDir} && git status`);
    const lastCommit = await sandbox.commands.run(`cd ${cloneDir} && git log -1 --oneline`);
    console.log("Git Status:\n", status.stdout);
    console.log("Last Commit:\n", lastCommit.stdout);

    try {
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
    }
  }

  return { sandbox, cloneDir, prUrl };
}
