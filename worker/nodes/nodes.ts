import { llm } from "../utils/llm";
import type { GraphState } from "../utils/state";

export async function analyzeFilesAndPlan(
  state: GraphState
): Promise<Partial<GraphState>> {
  const { prompt, fileContents, sandbox, repoPath } = state;

  console.log("Analyzing repository structure...");
  const repoStructure = await sandbox.commands.run(
    `cd ${repoPath} && find . -type f -not -path "./.git/*" | head -30`
  );

  const existingFiles = repoStructure.stdout
    .split("\n")
    .filter(Boolean)
    .map((f) => f.trim());

  console.log(`Found ${existingFiles.length} existing files in repo`);

  const hasReact = existingFiles.some(
    (f) => f.includes(".tsx") || f.includes(".jsx")
  );
  const hasVue = existingFiles.some((f) => f.includes(".vue"));
  const hasPackageJson = existingFiles.some((f) => f.includes("package.json"));
  const hasSrc = existingFiles.some((f) => f.startsWith("./src"));
  const hasTests = existingFiles.some(
    (f) => f.includes("test") || f.includes("spec")
  );

  const repoContext = {
    hasReact,
    hasVue,
    hasPackageJson,
    hasSrc,
    hasTests,
    existingFiles: existingFiles.slice(0, 20).join("\n"),
    fileCount: existingFiles.length,
  };

  console.log(
    `Repo context: React=${hasReact}, Vue=${hasVue}, Src=${hasSrc}, Tests=${hasTests}`
  );

  if (!fileContents || Object.keys(fileContents).length === 0) {
    console.log("No specific files found, asking AI to create new files");

    try {
      const { content } = await llm.invoke(`
User request: "${prompt}"

Repository context:
- Total files: ${repoContext.fileCount}
- Has React/JSX: ${repoContext.hasReact}
- Has Vue: ${repoContext.hasVue}
- Has src/ directory: ${repoContext.hasSrc}
- Has tests: ${repoContext.hasTests}
- Existing files:
${repoContext.existingFiles}

IMPORTANT RULES:
1. Match the existing technology stack (if React exists, use .tsx; if plain TS, use .ts)
2. Match the existing directory structure (if src/ exists, use it)
3. Create MINIMAL files - only what's necessary
4. If it's a simple request, create just ONE file
5. Don't create test files unless the repo already has tests
6. Don't create CSS files unless specifically requested or if the repo uses them

Analyze the request and decide what new files need to be created.
Return a JSON array (minimum 1 file, maximum 3 files):

[
  { 
    "file": "path/to/file.ts", 
    "reason": "why this file is needed", 
    "relevance": 90,
    "action": "create",
    "goal": "what this file should contain"
  }
]

Return ONLY the JSON array, no markdown formatting.
      `);

      const cleaned = content
        .trim()
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "");
      const parsed = JSON.parse(cleaned);

      console.log(`Planning to create ${parsed.length} new files`);

      return {
        relevantFiles: [],
        changePlan: parsed.map((p: any) => ({
          action: "create",
          file: p.file,
          goal: p.goal,
        })),
      };
    } catch (error) {
      console.error("Error parsing AI response:", error);

      const fallbackFile = repoContext.hasSrc
        ? "src/new_feature.ts"
        : "new_feature.ts";

      return {
        relevantFiles: [],
        changePlan: [
          {
            action: "create",
            file: fallbackFile,
            goal: "Create new file based on prompt",
          },
        ],
      };
    }
  }

  const contextText = Object.entries(fileContents)
    .map(([path, content]) => `File: ${path}\n${content.slice(0, 1500)}`)
    .join("\n\n---\n\n");

  try {
    console.log("Analyzing files and creating change plan...");
    const { content } = await llm.invoke(`
User request: "${prompt}"

Repository context:
- Has React/JSX: ${repoContext.hasReact}
- Has Vue: ${repoContext.hasVue}
- Has src/ directory: ${repoContext.hasSrc}
- Has tests: ${repoContext.hasTests}
- Existing structure:
${repoContext.existingFiles}

Here are the relevant existing files:
${contextText}

IMPORTANT RULES:
1. Match the existing technology stack and patterns
2. Prefer EDITING existing files over creating new ones when possible
3. Create MINIMAL new files - only what's absolutely necessary
4. Don't create test files unless the repo already has tests
5. Don't create CSS/styling files unless specifically requested
6. Keep file extensions consistent with the repo (.ts vs .tsx vs .js)

Analyze the request and decide:
1. Which existing files need to be EDITED (prefer this)
2. What new files need to be CREATED (only if necessary)
3. What files should be DELETED (if any)

Return a JSON array with the complete plan (maximum 5 files):

[
  { 
    "file": "path/to/existing.ts", 
    "reason": "why this file needs changes", 
    "relevance": 85,
    "action": "edit",
    "goal": "specific change to make"
  },
  { 
    "file": "path/to/new_file.ts", 
    "reason": "why this new file is needed", 
    "relevance": 90,
    "action": "create",
    "goal": "what this new file should contain"
  }
]

IMPORTANT: Use "edit" for modifying existing files and "create" for new files.
Return ONLY the JSON array, no markdown formatting.
    `);

    const cleaned = content
      .trim()
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "");
    const parsed = JSON.parse(cleaned);

    console.log(`Created plan for ${parsed.length} files`);

    return {
      relevantFiles: parsed
        .sort((a: any, b: any) => b.relevance - a.relevance)
        .slice(0, 10),
      changePlan: parsed.map((p: any) => ({
        action: p.action,
        file: p.file,
        goal: p.goal,
      })),
    };
  } catch (error) {
    console.error("Error parsing AI response:", error);
    return {
      relevantFiles: [],
      changePlan: [],
      error: "Failed to analyze files",
    };
  }
}

export async function applyChangesPartial(
  state: GraphState
): Promise<Partial<GraphState>> {
  const { sandbox, repoPath, changePlan, fileContents, prompt } = state;

  if (!changePlan || changePlan.length === 0) {
    console.log("No change plan available");
    return { error: "No change plan" };
  }

  console.log(`Applying changes to ${changePlan.length} files...`);
  const filesToModify: Array<{ filePath: string; newContent: string }> = [];

  try {
    for (const change of changePlan) {
      console.log(`Processing: ${change.file} (${change.action})`);
      const normalizedFile = change.file.replace(/^\.\//, "");
      const targetPath = `${repoPath}/${normalizedFile}`;

      if (change.action === "create") {
        const dirPath = normalizedFile.split("/").slice(0, -1).join("/");
        if (dirPath) {
          await sandbox.commands.run(`cd ${repoPath} && mkdir -p ${dirPath}`);
        }

        const { content } = await llm.invoke(`
Generate a complete, production-ready file for: ${normalizedFile}

Goal: ${change.goal}
User request: ${prompt}

Requirements:
- Write complete, working, MINIMAL code
- Include proper imports and exports
- Add comments only where necessary
- Follow best practices for the file type
- Keep it simple - don't over-engineer
- Match the style of a ${
          normalizedFile.endsWith(".ts")
            ? "TypeScript"
            : normalizedFile.endsWith(".tsx")
            ? "React TypeScript"
            : "JavaScript"
        } project

Return ONLY the file content, no explanation or markdown code blocks.
        `);

        const newContent = content
          .trim()
          .replace(/```[a-z]*\n?/g, "")
          .replace(/```\n?/g, "");

        await sandbox.files.write(targetPath, newContent);
        filesToModify.push({ filePath: normalizedFile, newContent });
      } else if (change.action === "edit") {
        let existingContent =
          fileContents?.[change.file] || fileContents?.[normalizedFile] || "";

        if (!existingContent) {
          try {
            existingContent = await sandbox.files.read(targetPath);
          } catch {
            console.log(`Could not read ${normalizedFile}, skipping`);
            continue;
          }
        }

        const { content } = await llm.invoke(`
You are editing this file: ${normalizedFile}

Current content:
\`\`\`
${existingContent}
\`\`\`

User request: ${prompt}
Change goal: ${change.goal}

Generate the COMPLETE modified file content that fulfills the user's request.
- Keep existing code that doesn't need changes
- Make the specific changes needed
- Maintain proper formatting and style
- Don't add unnecessary complexity

Return ONLY the full file content, no explanation or markdown code blocks.
        `);

        const newContent = content
          .trim()
          .replace(/```[a-z]*\n?/g, "")
          .replace(/```\n?/g, "");

        if (newContent !== existingContent && newContent.length > 10) {
          await sandbox.files.write(targetPath, newContent);
          filesToModify.push({ filePath: normalizedFile, newContent });
        }
      } else if (change.action === "delete") {
        try {
          await sandbox.files.remove(targetPath);
        } catch {
          console.log(`Could not delete ${normalizedFile}`);
        }
      }
    }

    console.log(`Total files modified: ${filesToModify.length}`);
    return {
      applyResult: { success: true },
      filesToModify,
    };
  } catch (e: any) {
    console.error("Error applying changes:", e);
    return {
      error: `Failed to apply changes: ${e.message}`,
      filesToModify,
    };
  }
}

export async function validateChanges(
  state: GraphState
): Promise<Partial<GraphState>> {
  const { sandbox, repoPath, validationAttempts = 0, filesToModify } = state;

  console.log(`Validating changes (attempt ${validationAttempts + 1})...`);

  if (!filesToModify || filesToModify.length === 0) {
    console.log("No files modified, skipping validation");
    return {
      validationSuccess: true,
      validationAttempts: validationAttempts + 1,
    };
  }

  try {
    const packageJsonCheck = await sandbox.commands.run(
      `cd ${repoPath} && test -f package.json && cat package.json | grep -q "lint" && echo "yes" || echo "no"`
    );

    if (packageJsonCheck.stdout.trim() === "yes") {
      const result = await sandbox.commands.run(
        `cd ${repoPath} && npm run lint || true`,
        { timeoutMs: 60000 }
      );
      const success = result.exitCode === 0;
      return {
        validationSuccess: success,
        validationAttempts: validationAttempts + 1,
      };
    } else {
      return {
        validationSuccess: true,
        validationAttempts: validationAttempts + 1,
      };
    }
  } catch (error) {
    console.error("Validation error:", error);
    return {
      validationSuccess: false,
      validationAttempts: validationAttempts + 1,
    };
  }
}
