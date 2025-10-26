import { cloneRepoAndSuggestFiles } from "./sandox/createsandbox";

const repoUrl = "https://github.com/hemanth-1321/test";

(async () => {
  const sandbox = await cloneRepoAndSuggestFiles(
    repoUrl,
    "add a new arthemetic operation function for division and modulo"
  );
  if (sandbox) {
    console.log(`Sandbox is ready with ID: ${sandbox.sandbox}`);
  }
})();
