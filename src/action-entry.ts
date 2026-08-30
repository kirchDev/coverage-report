import { core } from './workflow.ts';
import { run } from './action.ts';

try {
  await run();
} catch (error) {
  core.fail(error instanceof Error ? error.message : String(error));
}
