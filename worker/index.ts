import { cloneRepoAndSuggestFiles } from "./sandox/createsandbox";
import { Octokit } from "@octokit/rest";

const token = process.env.GITHUB_TOKEN;
const octokit = new Octokit({ auth: token });

export async function forkAndEditRepo(repoUrl: string, userPrompt: string) {
  try {
    const parts = repoUrl.replace("https://github.com/", "").split("/");
    const owner = parts[0];
    const repo = parts[1];
    if (!owner || !repo) throw new Error("Invalid repo URL");

    console.log(`Forking ${owner}/${repo}...`);
    const forkResp = await octokit.rest.repos.createFork({ owner, repo });
    const forkFullName = forkResp.data.full_name;
    const forkUrl = forkResp.data.clone_url;
    console.log(`Fork created: ${forkFullName} -> ${forkUrl}`);

    await new Promise((res) => setTimeout(res, 5000));

    const sandboxResult = await cloneRepoAndSuggestFiles(
      forkUrl,
      userPrompt,
      "/home/user/project",
      `${owner}/${repo}`,
      forkFullName
    );

    return {
      sandbox: sandboxResult.sandbox,
      forkFullName,
      forkUrl,
      prUrl: sandboxResult.prUrl,
    };
  } catch (err: any) {
    console.error("Error in forkAndEditRepo:", err.message || err);
    throw new Error(`Failed to fork and edit repo: ${err.message || err}`);
  }
}
