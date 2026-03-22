import { describe, expect, it } from 'bun:test';
import {
  commentsModel,
  issueLabelsModel,
  issuesModel,
  labelsModel,
  projectsModel,
  usersModel,
  workspacesModel,
} from './schema';

describe('Schema relations', () => {
  describe('Given the workspaces model', () => {
    it('Then it has no relations (it is the tenant root)', () => {
      expect(workspacesModel.relations).toEqual({});
    });

    it('Then its table is the tenant root', () => {
      expect(workspacesModel.table._tenant).toBe(true);
    });
  });

  describe('Given the users model', () => {
    it('Then it has no relations (cross-tenant, membership via role assignments)', () => {
      expect(usersModel.relations).toEqual({});
    });

    it('Then it is marked as shared (cross-tenant)', () => {
      expect(usersModel.table._shared).toBe(true);
    });
  });

  describe('Given the projects model', () => {
    it('Then it has a workspace relation via workspaceId', () => {
      expect(projectsModel.relations.workspace).toBeDefined();
      expect(projectsModel.relations.workspace._type).toBe('one');
      expect(projectsModel.relations.workspace._foreignKey).toBe('workspaceId');
    });

    it('Then it has a creator relation to users via createdBy', () => {
      expect(projectsModel.relations.creator).toBeDefined();
      expect(projectsModel.relations.creator._type).toBe('one');
      expect(projectsModel.relations.creator._foreignKey).toBe('createdBy');
    });

    it('Then it does not have a _tenant property (tenant is on the table)', () => {
      expect(projectsModel).not.toHaveProperty('_tenant');
    });
  });

  describe('Given the issues model', () => {
    it('Then it has a project relation via projectId', () => {
      expect(issuesModel.relations.project).toBeDefined();
      expect(issuesModel.relations.project._type).toBe('one');
      expect(issuesModel.relations.project._foreignKey).toBe('projectId');
    });

    it('Then it has an assignee relation to users via assigneeId', () => {
      expect(issuesModel.relations.assignee).toBeDefined();
      expect(issuesModel.relations.assignee._type).toBe('one');
      expect(issuesModel.relations.assignee._foreignKey).toBe('assigneeId');
    });

    it('Then it does not have a _tenant property (indirectly scoped)', () => {
      expect(issuesModel).not.toHaveProperty('_tenant');
    });
  });

  describe('Given the labels model', () => {
    it('Then it has a project relation via projectId', () => {
      expect(labelsModel.relations.project).toBeDefined();
      expect(labelsModel.relations.project._type).toBe('one');
      expect(labelsModel.relations.project._foreignKey).toBe('projectId');
    });

    it('Then it does not have a _tenant property (indirectly scoped)', () => {
      expect(labelsModel).not.toHaveProperty('_tenant');
    });
  });

  describe('Given the issueLabels model', () => {
    it('Then it has an issue relation via issueId', () => {
      expect(issueLabelsModel.relations.issue).toBeDefined();
      expect(issueLabelsModel.relations.issue._type).toBe('one');
      expect(issueLabelsModel.relations.issue._foreignKey).toBe('issueId');
    });

    it('Then it has a label relation via labelId', () => {
      expect(issueLabelsModel.relations.label).toBeDefined();
      expect(issueLabelsModel.relations.label._type).toBe('one');
      expect(issueLabelsModel.relations.label._foreignKey).toBe('labelId');
    });

    it('Then it does not have a _tenant property (indirectly scoped)', () => {
      expect(issueLabelsModel).not.toHaveProperty('_tenant');
    });
  });

  describe('Given the comments model', () => {
    it('Then it has an issue relation via issueId', () => {
      expect(commentsModel.relations.issue).toBeDefined();
      expect(commentsModel.relations.issue._type).toBe('one');
      expect(commentsModel.relations.issue._foreignKey).toBe('issueId');
    });

    it('Then it has an author relation to users via authorId', () => {
      expect(commentsModel.relations.author).toBeDefined();
      expect(commentsModel.relations.author._type).toBe('one');
      expect(commentsModel.relations.author._foreignKey).toBe('authorId');
    });

    it('Then it does not have a _tenant property (indirectly scoped)', () => {
      expect(commentsModel).not.toHaveProperty('_tenant');
    });
  });
});
