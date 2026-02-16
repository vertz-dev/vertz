export class BaseAnalyzer {
  project;
  config;
  _diagnostics = [];
  constructor(project, config) {
    this.project = project;
    this.config = config;
  }
  addDiagnostic(diagnostic) {
    this._diagnostics.push(diagnostic);
  }
  getDiagnostics() {
    return [...this._diagnostics];
  }
}
//# sourceMappingURL=base-analyzer.js.map
