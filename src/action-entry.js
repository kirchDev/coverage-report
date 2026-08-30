import { core } from './workflow.js';
import { run } from './action.js';

try {
  await run();
} catch (error) {
  core.fail(error instanceof Error ? error.message : String(error));
}
