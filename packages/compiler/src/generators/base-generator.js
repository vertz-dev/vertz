import { join } from 'node:path';
export class BaseGenerator {
  config;
  constructor(config) {
    this.config = config;
  }
  resolveOutputPath(outputDir, fileName) {
    return join(outputDir, fileName);
  }
}
//# sourceMappingURL=base-generator.js.map
