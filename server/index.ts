import { cloneRepoAndSuggestFiles } from "./sandox/createsandbox";
import { Octokit } from "@octokit/rest";

const repoUrl = "https://github.com/Deepak7704/lovable";
const token = process.env.GITHUB_TOKEN;
const octokit = new Octokit({ auth: token });

async function forkAndEditRepo(repoUrl: string, userPrompt: string) {
  const parts = repoUrl.replace("https://github.com/", "").split("/");
  const owner = parts[0];
  const repo = parts[1];
  if (!owner || !repo) throw new Error("Invalid repo URL");

  console.log(`Forking ${owner}/${repo}...`);
  const forkResp = await octokit.rest.repos.createFork({ owner, repo });
  const forkFullName = forkResp.data.full_name; // e.g. your-username/lovable
  const forkUrl = forkResp.data.clone_url;
  console.log(`Fork created: ${forkFullName} -> ${forkUrl}`);

  // Wait for fork to be ready
  await new Promise((res) => setTimeout(res, 5000));

  // Clone the fork and apply AI edits
  const sandboxResult = await cloneRepoAndSuggestFiles(
    forkUrl,
    userPrompt,
    "/home/user/project",
    `${owner}/${repo}`, // upstream/original repo
    forkFullName // your fork
  );

  return {
    sandbox: sandboxResult.sandbox,
    forkFullName,
    forkUrl,
    prUrl: sandboxResult.prUrl,
  };
}

(async () => {
  const result = await forkAndEditRepo(
    repoUrl,
    "create a new zod schema for projectTreeSchema"
  );

  if (result) {
    console.log(`Sandbox ready with ID: ${result.sandbox.sandboxId}`);
    console.log(`Fork URL: ${result.forkUrl}`);
    console.log(`Fork repo name: ${result.forkFullName}`);
    if (result.prUrl) console.log(`Pull Request created: ${result.prUrl}`);
    else console.log("No PR created (no AI changes).");
  }
})();
