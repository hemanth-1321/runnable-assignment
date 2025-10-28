import { Annotation } from "@langchain/langgraph";
import { Sandbox } from "@e2b/code-interpreter";

export const GraphState = Annotation.Root({
  prompt: Annotation<string>(),
  repoPath: Annotation<string>(),
  searchMode: Annotation<"grep" | "regex" | "glob">(),
  filePaths: Annotation<string[]>(),
  fileContents: Annotation<Record<string, string>>(),
  relevantFiles:
    Annotation<Array<{ file: string; reason: string; relevance: number }>>(),
  changePlan: Annotation<
    Array<{
      action: "edit" | "create" | "delete";
      file: string;
      goal: string;
    }>
  >(),
  diff: Annotation<string>(),
  applyResult: Annotation<any>(),
  summary: Annotation<string>(),
  error: Annotation<string>(),
  sandbox: Annotation<Awaited<ReturnType<typeof Sandbox.create>>>(),
  attempts: Annotation<number>(), // search retry counter
  validationAttempts: Annotation<number>(),
  validationSuccess: Annotation<boolean>(),
  filesToModify: Annotation<Array<{ filePath: string; newContent: string }>>(),
});

// ✅ Export the type for use in your node functions
export type GraphState = typeof GraphState.State;
