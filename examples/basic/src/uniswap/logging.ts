/** Logs a major example section so the runtime output reads like a walkthrough. */
export function logTitle(title: string): void {
  console.log(`\n${title}`);
  console.log('='.repeat(title.length));
}

/** Logs one ordered step in the example flow. */
export function logStep(message: string): void {
  console.log(`\n${message}`);
}

/** Logs one concise detail under the current example step. */
export function logDetail(label: string, value: string): void {
  console.log(`  - ${label}: ${value}`);
}
