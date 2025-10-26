import { Sandbox } from "@e2b/code-interpreter";
import { compareFilesWithPrompt } from "./findrelavnt";

const E2B_API_KEY = process.env.E2B_API_KEY;
if (!E2B_API_KEY) {
  throw new Error("E2B_API_KEY is not set in environment variables");
}

export interface CloneResult {
  sandbox: Awaited<ReturnType<typeof Sandbox.create>>;
  cloneDir: string;
  candidateFiles: string[];
  keywords: string[];
}
export async function cloneRepoAndSuggestFiles(
  repoUrl: string,
  userPrompt: string,
  baseDir = "/home/user/project"
): Promise<CloneResult> {
  console.log("Creating E2B sandbox...");
  const sandbox = await Sandbox.create({
    apiKey: E2B_API_KEY,
    timeoutMs: 30 * 60 * 1000,
  });
  console.log(`Sandbox created with ID: ${sandbox.sandboxId}`);

  const repoName = repoUrl.split("/").pop()!.replace(".git", "");
  const cloneDir = `${baseDir}/${repoName}`;

  // Check for git
  console.log("Checking for git...");
  const gitCheck = await sandbox.commands.run("git --version", {
    timeoutMs: 15000,
  });
  if (gitCheck.exitCode !== 0) {
    console.log("Installing git...");
    await sandbox.commands.run("apt-get update -y && apt-get install -y git", {
      timeoutMs: 120000,
    });
  }

  // Clone repository
  console.log(`Cloning repo: ${repoUrl} into ${cloneDir}`);
  await sandbox.commands.run(`rm -rf ${baseDir}`);
  await sandbox.commands.run(`mkdir -p ${baseDir}`);

  const cloneResult = await sandbox.commands.run(
    `git clone ${repoUrl} ${cloneDir}`,
    { timeoutMs: 300000 }
  );
  if (cloneResult.exitCode !== 0) {
    console.error("Git clone stderr:", cloneResult.stderr);
    throw new Error("Failed to clone repository");
  }
  console.log("✓ Repository cloned successfully!");

  // Extract keywords
  console.log(`\n🎯 Analyzing prompt: "${userPrompt}"`);
  const keywords = extractKeywords(userPrompt);
  console.log(`📝 Extracted keywords: ${keywords.join(", ")}`);

  if (keywords.length === 0) {
    console.warn("⚠️  No meaningful keywords extracted from prompt");
    return { sandbox, cloneDir, candidateFiles: [], keywords: [] };
  }

  // Search for files using grep
  console.log(`\n🔍 Searching for files containing keywords...`);
  const pattern = keywords.join("\\|");
  const grepCmd = `grep -rl "${pattern}" ${cloneDir} \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=dist \
    --exclude-dir=build \
    --exclude-dir=.next \
    --exclude-dir=coverage \
    --exclude-dir=__pycache__ \
    --exclude="*.log" \
    --exclude="*.map" \
    --exclude="*.lock" \
    --exclude="package-lock.json" \
    --exclude="yarn.lock" \
    2>/dev/null || true`;

  const searchResult = await sandbox.commands.run(grepCmd, {
    timeoutMs: 30000,
  });

  const foundFiles = searchResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  console.log(`\n📁 Found ${foundFiles.length} matching files:`);
  if (foundFiles.length === 0) {
    console.log("  ⚠️  No files found matching keywords");
    return { sandbox, cloneDir, candidateFiles: [], keywords };
  }

  const candidateFiles = foundFiles.slice(0, 10);
  candidateFiles.forEach((file, index) => {
    console.log(`  ${index + 1}. ${file.replace(`${cloneDir}/`, "")}`);
  });

  // Read file contents and pass to LLM for comparison
  console.log("\n📖 Reading and analyzing contents of matching files:");
  const fileContents = new Map<string, string>();

  for (const file of candidateFiles) {
    try {
      const content = await sandbox.files.read(file);
      fileContents.set(file, content);
      console.log(`  ✓ Read ${file} (${content.length} bytes)}`);
    } catch (error) {
      console.error(`  ✗ Error reading ${file}:`, error);
    }
  }
  const aiResult = await compareFilesWithPrompt(
    userPrompt,
    fileContents,
    sandbox
  );
  if (aiResult.filesToModify?.length > 0) {
    console.log("\n💾 Committing and pushing changes...");

    await sandbox.commands.run(`git config --global user.name "hemanth-1321"`);
    await sandbox.commands.run(
      `git config --global user.email "hemanth02135@gmail.com"`
    );
    await sandbox.commands.run(`cd ${cloneDir} && git checkout -b ai-edits`);
    await sandbox.commands.run(`cd ${cloneDir} && git add .`);
    await sandbox.commands.run(
      `cd ${cloneDir} && git commit -m "AI applied changes: ${userPrompt}" || echo "No changes to commit"`
    );

    const repoWithToken = repoUrl.replace(
      "https://",
      `https://${process.env.GITHUB_TOKEN}@`
    );
    await sandbox.commands.run(
      `cd ${cloneDir} && git push ${repoWithToken} HEAD`
    );

    console.log("✅ Changes pushed to branch 'ai-edits'");
  } else {
    console.log("⚠️ No files modified by AI. Skipping commit.");
  }
  console.log(`\n✓ Finished reading ${fileContents.size} files\n`);

  return {
    sandbox,
    cloneDir,
    candidateFiles,
    keywords,
  };
}

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
    .replace(/[^\w\s]/g, " ") // Remove punctuation
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  return [...new Set(words)];
}
