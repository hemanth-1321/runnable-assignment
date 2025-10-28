import type { GraphState } from "../utils/state";

export function shouldRetrySearch(state: GraphState): string {
  const attempts = state.attempts || 0;

  if (state.error) {
    console.log("Error detected, stopping search");
    return "error";
  }

  const noFilesFound = !state.relevantFiles || state.relevantFiles.length === 0;
  const hasChangePlan = state.changePlan && state.changePlan.length > 0;

  if (noFilesFound) {
    if (hasChangePlan) {
      console.log("No existing files, but have plan to create new files");
      return "continue";
    }

    if (attempts >= 3) {
      console.log("Max search retries (3) reached, but have no plan");
      return hasChangePlan ? "continue" : "error";
    }

    console.log(`No files found, retrying... (attempt ${attempts + 1}/3)`);
    return "search_files";
  }

  console.log("Files found, continuing to apply changes");
  return "continue";
}

export function shouldRetryValidation(state: GraphState): string {
  const validationAttempts = state.validationAttempts || 0;

  if (state.error) {
    console.log("Error detected, stopping validation");
    return "error";
  }

  if (!state.filesToModify || state.filesToModify.length === 0) {
    console.log("No files to validate, treating as success");
    return "success";
  }

  if (state.validationSuccess === false) {
    if (validationAttempts >= 3) {
      console.log("Max validation retries (3) reached");
      return "validation_failed";
    }
    console.log(
      `Validation failed, retrying... (attempt ${validationAttempts + 1}/3)`
    );
    return "search_files";
  }

  console.log("Validation successful!");
  return "success";
}
