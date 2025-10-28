import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { decideSearchMode, readFiles, searchFiles } from "./toolNodes";
import { GraphState } from "../utils/state";
import {
  analyzeFilesAndPlan,
  applyChangesPartial,
  validateChanges,
} from "./nodes";
import { shouldRetrySearch, shouldRetryValidation } from "./conditions";

const workflow = new StateGraph(GraphState);

workflow
  .addNode("decide_search_mode", decideSearchMode)
  .addNode("search_files", searchFiles)
  .addNode("read_files", readFiles)
  .addNode("analyze_files", analyzeFilesAndPlan)
  .addNode("apply_changes", applyChangesPartial)
  .addNode("validate_changes", validateChanges)
  .addEdge(START, "decide_search_mode")
  .addEdge("decide_search_mode", "search_files")
  .addEdge("search_files", "read_files")
  .addEdge("read_files", "analyze_files")
  .addConditionalEdges("analyze_files", shouldRetrySearch, {
    continue: "apply_changes",
    search_files: "search_files",
    error: END,
  })
  .addEdge("apply_changes", "validate_changes")
  .addConditionalEdges("validate_changes", shouldRetryValidation, {
    success: END,
    search_files: "search_files",
    validation_failed: END,
    error: END,
  });

export const codeEditorGraph = workflow.compile();
