export type DeployTarget = 'fly' | 'railway' | 'docker';
export declare function detectTarget(
  projectRoot: string,
  existsFn: (path: string) => boolean,
): DeployTarget | null;
//# sourceMappingURL=detector.d.ts.map
