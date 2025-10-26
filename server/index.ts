import { cloneRepoAndSuggestFiles } from "./sandox/createsandbox";

const repoUrl = "https://github.com/hemanth-1321/test";

(async () => {
  const sandbox = await cloneRepoAndSuggestFiles(
    repoUrl,
    "update the multiply function to addition in main.ts"
  );
  if (sandbox) {
    console.log(`Sandbox is ready with ID: ${sandbox.sandbox}`);
  }
})();
