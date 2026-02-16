export class ParseContext {
  issues = [];
  _path = [];
  addIssue(issue) {
    this.issues.push({
      ...issue,
      path: issue.path ?? [...this._path],
    });
  }
  hasIssues() {
    return this.issues.length > 0;
  }
  pushPath(segment) {
    this._path.push(segment);
  }
  popPath() {
    this._path.pop();
  }
  get path() {
    return [...this._path];
  }
}
//# sourceMappingURL=parse-context.js.map
